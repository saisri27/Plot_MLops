"""
LLM Reranker for the Plot Decision Engine.

The v0 weighted scorer in `decision_engine.compute_score` produces an ordered
list of candidate venues. This module takes the top-N candidates and asks an
LLM (default: OpenAI gpt-4o-mini) to pick the final top-K and write a
one-sentence reason for each pick that references the specific group's
preferences.

Lenient validation policy:
  - If the LLM returns picks not in the candidate set, those picks are dropped
    and a warning is logged. We do NOT raise.
  - If the LLM returns fewer picks than top_k, we return what we got. We do
    NOT raise.
  - We raise `LLMRerankError` only on hard failures (timeout, HTTP error,
    malformed JSON, empty response). The caller (`/recommend`) catches this
    and falls back to v0 ordering.

Tests inject a fake `client` to exercise this code path without making real
network calls.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from pydantic import BaseModel

logger = logging.getLogger(__name__)

PROMPT_VERSION = "rerank_v1"

# Pricing as of 2026-04-25 — re-verify against OpenAI's pricing page if rates
# change. Values are USD per 1M tokens. The cost test in test_llm_rerank.py
# pins these constants and will fail loudly if they're edited carelessly.
PRICING_LAST_UPDATED = "2026-04-25"
PRICING_USD_PER_1M_TOKENS: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4o": {"input": 2.50, "output": 10.00},
}

# PR 1 keeps the prompt inline. PR 2 will move this to prompts/rerank_v1.txt
# so prompts can be versioned, A/B tested, and registered as MLflow artifacts.
_INLINE_PROMPT_TEMPLATE = """You are a venue recommendation expert for group hangouts in San Francisco.

Group context:
- Group size: {group_size} people
- Budget: {merged_budget}
- Max travel distance: {merged_max_distance} km
- Category weights (fraction of group wanting each): {category_weights}

Candidate venues (already pre-ranked by a heuristic scorer):
{numbered_candidate_list}

Pick the top {top_k} venues for THIS group. For each pick, write one sentence
explaining why it fits this specific group's preferences (mention budget,
group size, category fit, or what makes it distinctive).

You MUST only pick venues from the candidate list above. Use exact names.

Output JSON (and nothing else):
{{"recommendations": [{{"name": "<exact name from list>", "reason": "..."}}, ...]}}
"""


class LLMRerankResult(BaseModel):
    name: str
    reason: str
    llm_rank: int


class LLMRerankMetadata(BaseModel):
    model: str
    prompt_version: str
    latency_ms: int
    input_tokens: int
    output_tokens: int
    cost_usd: float


class LLMRerankError(Exception):
    """Raised on hard failures that should trigger v0 fallback in /recommend."""


def _format_candidates(candidates: list[dict[str, Any]]) -> str:
    """Render candidate venues as a numbered list the LLM can reference."""
    lines = []
    for i, v in enumerate(candidates, start=1):
        name = v.get("name", "<unknown>")
        category = v.get("category", "")
        rating = v.get("rating", "?")
        price = v.get("price_level", "?")
        distance = v.get("distance_km", "?")
        lines.append(
            f"{i}. {name} | {category} | rating={rating} | price={price} | distance_km={distance}"
        )
    return "\n".join(lines)


def _build_prompt(
    candidates: list[dict[str, Any]],
    merged_prefs: dict[str, Any],
    group_size: int,
    top_k: int,
) -> str:
    """Build the user-facing prompt string. Pure function — easy to unit test."""
    return _INLINE_PROMPT_TEMPLATE.format(
        group_size=group_size,
        merged_budget=merged_prefs.get("merged_budget", "medium"),
        merged_max_distance=merged_prefs.get("merged_max_distance", 5.0),
        category_weights=merged_prefs.get("category_weights", {}),
        numbered_candidate_list=_format_candidates(candidates),
        top_k=top_k,
    )


def _compute_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Compute USD cost from token counts. Unknown models cost 0 (logs warning)."""
    rates = PRICING_USD_PER_1M_TOKENS.get(model)
    if rates is None:
        logger.warning("No pricing entry for model=%s — cost will be reported as 0.", model)
        return 0.0
    return round(
        (input_tokens / 1_000_000) * rates["input"] + (output_tokens / 1_000_000) * rates["output"],
        6,
    )


def _parse_response_content(content: str) -> list[dict[str, Any]]:
    """Parse the LLM's JSON output. Raises LLMRerankError on bad shape."""
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError) as exc:
        raise LLMRerankError(f"LLM response was not valid JSON: {exc}") from exc

    if not isinstance(data, dict):
        raise LLMRerankError("LLM response JSON was not an object")

    recs = data.get("recommendations")
    if not isinstance(recs, list):
        raise LLMRerankError("LLM response missing 'recommendations' list")

    return recs


def rerank_venues(
    candidates: list[dict[str, Any]],
    merged_prefs: dict[str, Any],
    group_size: int,
    top_k: int = 5,
    *,
    model: str = "gpt-4o-mini",
    temperature: float = 0.0,
    timeout_s: float = 8.0,
    client: Any | None = None,
) -> tuple[list[LLMRerankResult], LLMRerankMetadata]:
    """
    Rerank v0 candidates with an LLM and return top_k picks plus call metadata.

    Args:
        candidates: v0-scored venue dicts. Each must have a 'name' field.
        merged_prefs: output of decision_engine.merge_preferences.
        group_size: number of users in the group.
        top_k: how many picks to ask the LLM for.
        model: OpenAI model identifier.
        temperature: passed through to the chat completion call.
        timeout_s: hard timeout for the LLM call.
        client: an OpenAI-shaped client (real or fake). If None, a real
            client is constructed lazily — meaning real OpenAI is only
            contacted when no client is injected.

    Returns:
        (picks, metadata)
        - picks may have fewer than top_k entries (lenient mode).
        - picks may be empty if every LLM pick was hallucinated; callers
          should treat empty as "fall back to v0".

    Raises:
        LLMRerankError on hard failures (timeout, HTTP error, malformed JSON).
    """
    if not candidates:
        raise LLMRerankError("rerank_venues called with empty candidate list")

    if client is None:
        # Lazy import so test environments without `openai` installed still
        # work as long as a fake client is injected.
        try:
            from openai import OpenAI
        except ImportError as exc:
            raise LLMRerankError("openai package not installed and no client injected") from exc
        client = OpenAI()

    prompt = _build_prompt(candidates, merged_prefs, group_size, top_k)

    start = time.perf_counter()
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": prompt}],
            temperature=temperature,
            response_format={"type": "json_object"},
            max_tokens=800,
            timeout=timeout_s,
        )
    except TimeoutError as exc:
        raise LLMRerankError(f"LLM call timed out after {timeout_s}s") from exc
    except Exception as exc:
        # Catch-all for HTTP errors / SDK exceptions. We re-raise as our own
        # exception type so the /recommend handler can fall back cleanly.
        raise LLMRerankError(f"LLM call failed: {exc}") from exc

    latency_ms = int((time.perf_counter() - start) * 1000)

    # Defensive shape access — fake clients in tests must mimic this layout.
    try:
        content = completion.choices[0].message.content
        usage = completion.usage
        input_tokens = int(usage.prompt_tokens)
        output_tokens = int(usage.completion_tokens)
    except (AttributeError, IndexError, TypeError) as exc:
        raise LLMRerankError(f"LLM response had unexpected shape: {exc}") from exc

    if content is None or content.strip() == "":
        raise LLMRerankError("LLM returned empty content")

    raw_picks = _parse_response_content(content)

    # Lenient validation: drop hallucinated names, return what's left.
    candidate_names = {c.get("name") for c in candidates}
    picks: list[LLMRerankResult] = []
    dropped: list[str] = []
    for raw in raw_picks:
        if not isinstance(raw, dict):
            continue
        name = raw.get("name")
        reason = raw.get("reason", "")
        if name not in candidate_names:
            dropped.append(str(name))
            continue
        picks.append(LLMRerankResult(name=name, reason=reason, llm_rank=len(picks) + 1))
        if len(picks) >= top_k:
            break

    if dropped:
        logger.warning(
            "LLM returned %d hallucinated venue name(s) not in candidates: %s",
            len(dropped),
            dropped,
        )

    if len(picks) < top_k:
        logger.warning("LLM returned %d valid picks but top_k=%d was requested.", len(picks), top_k)

    metadata = LLMRerankMetadata(
        model=model,
        prompt_version=PROMPT_VERSION,
        latency_ms=latency_ms,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_usd=_compute_cost(model, input_tokens, output_tokens),
    )

    return picks, metadata
