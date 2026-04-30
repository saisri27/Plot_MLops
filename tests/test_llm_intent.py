"""
Offline tests for llm_intent.parse_intent and the lenient _coerce_intent
validator. Real OpenAI is never called — every test injects a fake client
via the conftest `make_fake_openai_client` fixture.
"""

from __future__ import annotations

import pytest

import llm_intent
from llm_intent import (
    ALLOWED_CATEGORIES,
    DEFAULT_INTENT,
    LLMIntentError,
    _coerce_intent,
    parse_intent,
)


# ---------------------------------------------------------------------------
# _coerce_intent: lenient field-by-field validation
# ---------------------------------------------------------------------------


def test_coerce_intent_happy_path():
    intent = _coerce_intent(
        {"budget": "low", "max_distance_km": 3.5, "categories": ["Food & Drink"]}
    )
    assert intent.budget == "low"
    assert intent.max_distance_km == 3.5
    assert intent.categories == ["Food & Drink"]


def test_coerce_intent_unknown_budget_falls_back_to_medium():
    intent = _coerce_intent(
        {"budget": "lavish", "max_distance_km": 5.0, "categories": ["Food & Drink"]}
    )
    assert intent.budget == "medium"


def test_coerce_intent_clamps_distance_below_min():
    intent = _coerce_intent({"budget": "medium", "max_distance_km": 0.1, "categories": []})
    assert intent.max_distance_km == 0.5


def test_coerce_intent_clamps_distance_above_max():
    intent = _coerce_intent({"budget": "medium", "max_distance_km": 9999, "categories": []})
    assert intent.max_distance_km == 50.0


def test_coerce_intent_drops_unknown_categories():
    intent = _coerce_intent(
        {
            "budget": "medium",
            "max_distance_km": 5.0,
            "categories": ["Food & Drink", "Bowling", "Outdoors"],
        }
    )
    assert intent.categories == ["Food & Drink", "Outdoors"]


def test_coerce_intent_empty_categories_defaults_to_food_and_drink():
    intent = _coerce_intent({"budget": "medium", "max_distance_km": 5.0, "categories": []})
    assert intent.categories == ["Food & Drink"]


def test_coerce_intent_non_string_distance_defaults_to_5():
    intent = _coerce_intent(
        {"budget": "medium", "max_distance_km": "five", "categories": ["Outdoors"]}
    )
    assert intent.max_distance_km == 5.0


# ---------------------------------------------------------------------------
# parse_intent end-to-end with a fake client
# ---------------------------------------------------------------------------


def test_parse_intent_happy_path(make_fake_openai_client):
    client = make_fake_openai_client(
        response_json={
            "budget": "high",
            "max_distance_km": 8,
            "categories": ["Food & Drink", "Nightlife"],
        }
    )
    intent, meta = parse_intent("fancy cocktail night", client=client)
    assert intent.budget == "high"
    assert intent.max_distance_km == 8.0
    assert intent.categories == ["Food & Drink", "Nightlife"]
    assert meta.model == "gpt-4o-mini"
    assert meta.prompt_version == "parse_intent_v1"
    assert meta.input_tokens == 100
    assert meta.output_tokens == 50
    assert meta.cost_usd > 0


def test_parse_intent_empty_input_raises():
    with pytest.raises(LLMIntentError):
        parse_intent("   ", client=object())


def test_parse_intent_malformed_json_raises(make_fake_openai_client):
    client = make_fake_openai_client(content_override="this is not json")
    with pytest.raises(LLMIntentError):
        parse_intent("anything", client=client)


def test_parse_intent_empty_content_raises(make_fake_openai_client):
    client = make_fake_openai_client(content_override="")
    with pytest.raises(LLMIntentError):
        parse_intent("anything", client=client)


def test_parse_intent_timeout_raises(make_fake_openai_client):
    client = make_fake_openai_client(raises=TimeoutError("timed out"))
    with pytest.raises(LLMIntentError):
        parse_intent("anything", client=client)


def test_parse_intent_generic_sdk_error_raises(make_fake_openai_client):
    client = make_fake_openai_client(raises=RuntimeError("kaboom"))
    with pytest.raises(LLMIntentError):
        parse_intent("anything", client=client)


def test_parse_intent_lenient_with_unknown_categories(make_fake_openai_client):
    """LLM hallucinates a category not in our list — coerce drops it."""
    client = make_fake_openai_client(
        response_json={
            "budget": "medium",
            "max_distance_km": 5,
            "categories": ["Bowling", "Outdoors"],
        }
    )
    intent, _ = parse_intent("anything", client=client)
    assert intent.categories == ["Outdoors"]


# ---------------------------------------------------------------------------
# Module-level invariants
# ---------------------------------------------------------------------------


def test_default_intent_is_valid():
    """DEFAULT_INTENT must always satisfy our own coercer — guards against drift."""
    intent = _coerce_intent(dict(DEFAULT_INTENT))
    assert intent.budget == DEFAULT_INTENT["budget"]
    assert intent.max_distance_km == DEFAULT_INTENT["max_distance_km"]
    assert intent.categories == list(DEFAULT_INTENT["categories"])


def test_allowed_categories_matches_demo():
    """Smoke check that the canonical list is a non-empty list of strings."""
    assert len(ALLOWED_CATEGORIES) >= 5
    assert all(isinstance(c, str) and c.strip() for c in ALLOWED_CATEGORIES)


def test_pricing_table_has_default_model():
    assert "gpt-4o-mini" in llm_intent.PRICING_USD_PER_1M_TOKENS
