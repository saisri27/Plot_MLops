"""
LLM Intent Parser for the Plot Decision Engine.

Takes a free-text description ("chill cocktail night, no clubs") and returns
structured preferences the recommender already knows how to consume:
  {budget, max_distance_km, categories[]}

Same shape as llm_rerank.py: lenient validation, injectable client for tests,
hard failures raise LLMIntentError so the caller can fall back to defaults.
"""

from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)

PROMPT_VERSION = "parse_intent_v1"
PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"

# Mirror llm_rerank.PRICING_USD_PER_1M_TOKENS — kept separate so changing
# the rerank price table doesn't accidentally re-price intent calls.
PRICING_USD_PER_1M_TOKENS: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
}

# Canonical list — must match demo.html CATEGORIES and the values used by
# fetch_venues_from_bigquery's category filter. Keep in sync.
# Religious Places removed: BigQuery only has 1 venue in that category, so the
# chip used to look broken. Add it back if the scraper starts populating it.
ALLOWED_CATEGORIES: list[str] = [
    "Food & Drink",
    "Outdoors",
    "Entertainment",
    "Arts & Culture",
    "Nightlife",
    "Sports & Recreation",
    "Wellness & Beauty",
    "Shopping",
    "Classes & Workshops",
    "Pets & Animals",
]

ALLOWED_BUDGETS = {"low", "medium", "high"}

DEFAULT_INTENT = {
    "budget": "medium",
    "max_distance_km": 5.0,
    "categories": ["Food & Drink"],
}


def _load_prompt_template(version: str = PROMPT_VERSION) -> str:
    return (PROMPTS_DIR / f"{version}.txt").read_text(encoding="utf-8")


_PROMPT_TEMPLATE = _load_prompt_template()

OPENAI_AVAILABLE: bool = bool(os.getenv("OPENAI_API_KEY"))
if not OPENAI_AVAILABLE:
    logger.warning(
        "OPENAI_API_KEY not set — /parse will return defaults instead of calling the LLM."
    )


class ParsedIntent(BaseModel):
    budget: str
    max_distance_km: float
    categories: list[str]


class LLMIntentMetadata(BaseModel):
    model: str
    prompt_version: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class LLMIntentError(Exception):
    """Raised on hard failures (timeout, HTTP error, malformed JSON)."""


def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = PRICING_USD_PER_1M_TOKENS.get(model)
    if rates is None:
        return 0.0
    return round(
        (input_tokens / 1_000_000) * rates["input"] + (output_tokens / 1_000_000) * rates["output"],
        6,
    )


def _coerce_intent(raw: dict[str, Any]) -> ParsedIntent:
    """
    Apply lenient validation to whatever the LLM returned. Always returns
    a valid ParsedIntent — falls back per-field rather than raising, so a
    single weird field doesn't blow up the whole call.
    """
    budget = str(raw.get("budget", "medium")).lower().strip()
    if budget not in ALLOWED_BUDGETS:
        budget = "medium"

    try:
        dist = float(raw.get("max_distance_km", 5.0))
    except (TypeError, ValueError):
        dist = 5.0
    dist = max(0.5, min(dist, 50.0))

    raw_cats = raw.get("categories") or []
    if not isinstance(raw_cats, list):
        raw_cats = []
    cats = [c for c in raw_cats if isinstance(c, str) and c in ALLOWED_CATEGORIES]
    if not cats:
        cats = ["Food & Drink"]

    return ParsedIntent(budget=budget, max_distance_km=dist, categories=cats)


def parse_intent(
    free_text: str,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.0,
    timeout_s: float = 5.0,
    client: Any | None = None,
) -> tuple[ParsedIntent, LLMIntentMetadata]:
    """
    Convert free-text into ParsedIntent. Tests pass a fake `client` to avoid
    real OpenAI calls.

    Raises LLMIntentError on hard failures (empty input, timeout, malformed JSON).
    """
    if not free_text or not free_text.strip():
        raise LLMIntentError("free_text was empty")

    if client is None:
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise LLMIntentError("openai package not installed and no client injected") from exc
        client = OpenAI()

    prompt = _PROMPT_TEMPLATE.format(
        free_text=free_text.strip(),
        category_list="\n".join(f"- {c}" for c in ALLOWED_CATEGORIES),
    )

    start = time.perf_counter()
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            response_format={"type": "json_object"},
            max_tokens=300,
            timeout=timeout_s,
        )
    except TimeoutError as exc:
        raise LLMIntentError(f"LLM call timed out after {timeout_s}s") from exc
    except Exception as exc:
        raise LLMIntentError(f"LLM call failed: {exc}") from exc

    latency_ms = int((time.perf_counter() - start) * 1000)

    try:
        content = completion.choices[0].message.content
        usage = completion.usage
        input_tokens = int(usage.prompt_tokens)
        output_tokens = int(usage.completion_tokens)
    except (AttributeError, IndexError, TypeError) as exc:
        raise LLMIntentError(f"LLM response had unexpected shape: {exc}") from exc

    if content is None or content.strip() == "":
        raise LLMIntentError("LLM returned empty content")

    try:
        raw = json.loads(content)
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMIntentError(f"LLM response was not valid JSON: {exc}") from exc
    if not isinstance(raw, dict):
        raise LLMIntentError("LLM response JSON was not an object")

    intent = _coerce_intent(raw)
    metadata = LLMIntentMetadata(
        model=model,
        prompt_version=PROMPT_VERSION,
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=_compute_cost(model, input_tokens, output_tokens),
    )
    return intent, metadata
