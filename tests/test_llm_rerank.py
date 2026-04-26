"""
Unit tests for llm_rerank.py.

All tests inject a fake OpenAI-shaped client via the `client` parameter so
no network calls are made and no API key is needed in CI. The fake is
provided by the `make_fake_openai_client` fixture in conftest.py.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

pytest.importorskip("pydantic")

import llm_rerank as lr  # noqa: E402

# ---------------------------------------------------------------------------
# Test fixtures: realistic candidate set + merged prefs
# ---------------------------------------------------------------------------


def _candidates() -> list[dict]:
    return [
        {
            "name": "Dolores Park Cafe",
            "category": "Food & Drink",
            "rating": 4.6,
            "distance_km": 1.2,
            "price_level": "low",
        },
        {
            "name": "Tartine Bakery",
            "category": "Food & Drink",
            "rating": 4.5,
            "distance_km": 1.5,
            "price_level": "medium",
        },
        {
            "name": "Mission Bowling Club",
            "category": "Entertainment",
            "rating": 4.3,
            "distance_km": 2.1,
            "price_level": "medium",
        },
        {
            "name": "Crissy Field",
            "category": "Outdoors",
            "rating": 4.8,
            "distance_km": 4.0,
            "price_level": "low",
        },
        {
            "name": "Smuggler's Cove",
            "category": "Food & Drink",
            "rating": 4.7,
            "distance_km": 2.8,
            "price_level": "medium",
        },
    ]


def _merged_prefs() -> dict:
    return {
        "merged_budget": "medium",
        "merged_max_distance": 5.0,
        "category_weights": {"Food & Drink": 1.0, "Outdoors": 0.5},
        "all_categories": ["Food & Drink", "Outdoors"],
    }


# ---------------------------------------------------------------------------
# Core happy-path and contract
# ---------------------------------------------------------------------------


def test_rerank_returns_top_k_results(make_fake_openai_client):
    client = make_fake_openai_client(
        {
            "recommendations": [
                {"name": "Dolores Park Cafe", "reason": "matches budget and category"},
                {"name": "Tartine Bakery", "reason": "highly rated bakery option"},
                {"name": "Crissy Field", "reason": "outdoor option for the half who want it"},
            ]
        }
    )
    picks, _ = lr.rerank_venues(
        _candidates(), _merged_prefs(), group_size=2, top_k=3, client=client
    )
    assert len(picks) == 3
    assert all(isinstance(p, lr.LLMRerankResult) for p in picks)


def test_rerank_returns_valid_metadata(make_fake_openai_client):
    client = make_fake_openai_client(
        {"recommendations": [{"name": "Crissy Field", "reason": "scenic outdoors"}]},
        prompt_tokens=420,
        completion_tokens=37,
    )
    _, meta = lr.rerank_venues(_candidates(), _merged_prefs(), group_size=2, top_k=1, client=client)
    assert isinstance(meta, lr.LLMRerankMetadata)
    assert meta.model == "gpt-4o-mini"
    assert meta.prompt_version == lr.PROMPT_VERSION
    assert meta.input_tokens == 420
    assert meta.output_tokens == 37
    assert meta.cost_usd > 0
    assert meta.latency_ms >= 0


def test_rerank_respects_top_k(make_fake_openai_client):
    # LLM tries to return 5 picks, but we asked for top_k=3
    client = make_fake_openai_client(
        {"recommendations": [{"name": c["name"], "reason": "x"} for c in _candidates()]}
    )
    picks, _ = lr.rerank_venues(
        _candidates(), _merged_prefs(), group_size=2, top_k=3, client=client
    )
    assert len(picks) == 3


def test_rerank_preserves_llm_ordering(make_fake_openai_client):
    client = make_fake_openai_client(
        {
            "recommendations": [
                {"name": "Crissy Field", "reason": "third"},
                {"name": "Dolores Park Cafe", "reason": "first"},
                {"name": "Tartine Bakery", "reason": "second"},
            ]
        }
    )
    picks, _ = lr.rerank_venues(
        _candidates(), _merged_prefs(), group_size=2, top_k=3, client=client
    )
    assert [p.name for p in picks] == [
        "Crissy Field",
        "Dolores Park Cafe",
        "Tartine Bakery",
    ]
    assert [p.llm_rank for p in picks] == [1, 2, 3]


# ---------------------------------------------------------------------------
# Lenient validation — drop hallucinations, return partial
# ---------------------------------------------------------------------------


def test_rerank_drops_hallucinated_picks(make_fake_openai_client):
    # 1 of 3 picks is a name not in the candidate set; should be silently dropped.
    client = make_fake_openai_client(
        {
            "recommendations": [
                {"name": "Dolores Park Cafe", "reason": "valid"},
                {"name": "Made Up Restaurant", "reason": "hallucinated"},
                {"name": "Tartine Bakery", "reason": "valid"},
            ]
        }
    )
    picks, _ = lr.rerank_venues(
        _candidates(), _merged_prefs(), group_size=2, top_k=5, client=client
    )
    names = [p.name for p in picks]
    assert "Made Up Restaurant" not in names
    assert names == ["Dolores Park Cafe", "Tartine Bakery"]
    assert [p.llm_rank for p in picks] == [1, 2]


def test_rerank_returns_partial_when_llm_returns_fewer(make_fake_openai_client):
    # top_k=5 but LLM returns only 2 valid picks. Return the 2 picks, do not raise.
    client = make_fake_openai_client(
        {
            "recommendations": [
                {"name": "Crissy Field", "reason": "outdoorsy"},
                {"name": "Dolores Park Cafe", "reason": "casual"},
            ]
        }
    )
    picks, _ = lr.rerank_venues(
        _candidates(), _merged_prefs(), group_size=2, top_k=5, client=client
    )
    assert len(picks) == 2


# ---------------------------------------------------------------------------
# Hard-error fallback path — these should raise LLMRerankError
# ---------------------------------------------------------------------------


def test_rerank_handles_malformed_json(make_fake_openai_client):
    client = make_fake_openai_client(content_override="this is not json at all")
    with pytest.raises(lr.LLMRerankError):
        lr.rerank_venues(_candidates(), _merged_prefs(), group_size=2, top_k=3, client=client)


def test_rerank_handles_timeout(make_fake_openai_client):
    client = make_fake_openai_client(raises=TimeoutError("simulated timeout"))
    with pytest.raises(lr.LLMRerankError):
        lr.rerank_venues(_candidates(), _merged_prefs(), group_size=2, top_k=3, client=client)


# ---------------------------------------------------------------------------
# Internals — _build_prompt and _compute_cost
# ---------------------------------------------------------------------------


def test_prompt_contains_all_candidate_names():
    candidates = _candidates()
    prompt = lr._build_prompt(candidates, _merged_prefs(), group_size=2, top_k=3)

    for c in candidates:
        assert c["name"] in prompt, f"{c['name']} missing from prompt"

    # All format placeholders must be filled in.
    assert "{numbered_candidate_list}" not in prompt
    assert "{merged_budget}" not in prompt
    assert "{top_k}" not in prompt

    # Group context must be reflected in the prompt body.
    assert "medium" in prompt  # merged_budget
    assert "2 people" in prompt or "Group size: 2" in prompt
    assert "Food & Drink" in prompt


def test_cost_calculation():
    # gpt-4o-mini: $0.15 per 1M input tokens, $0.60 per 1M output tokens.
    # 1000 input * 0.15/1M = $0.00015
    # 500 output * 0.60/1M  = $0.00030
    # total = $0.00045
    cost = lr._compute_cost(model="gpt-4o-mini", input_tokens=1000, output_tokens=500)
    assert cost == pytest.approx(0.00045)


def test_cost_calculation_unknown_model_returns_zero():
    cost = lr._compute_cost(model="unknown-model-xyz", input_tokens=1000, output_tokens=500)
    assert cost == 0.0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_rerank_with_fewer_candidates_than_top_k(make_fake_openai_client):
    only_two = _candidates()[:2]
    client = make_fake_openai_client(
        {
            "recommendations": [
                {"name": only_two[0]["name"], "reason": "a"},
                {"name": only_two[1]["name"], "reason": "b"},
            ]
        }
    )
    picks, _ = lr.rerank_venues(only_two, _merged_prefs(), group_size=2, top_k=5, client=client)
    assert len(picks) == 2
    # Should still have called the LLM exactly once.
    assert client.chat.completions.create.call_count == 1


# ---------------------------------------------------------------------------
# Refactor-safety: the prompt is actually loaded from prompts/<version>.txt,
# not from a leftover inline string. This test pins the file-backed contract
# so future edits can't silently revert.
# ---------------------------------------------------------------------------


def test_prompt_template_loaded_from_file(tmp_path, monkeypatch):
    fake_dir = tmp_path / "prompts"
    fake_dir.mkdir()
    (fake_dir / "rerank_v1.txt").write_text(
        "FAKE_TEMPLATE {numbered_candidate_list} {top_k} {merged_budget} "
        "{merged_max_distance} {category_weights} {group_size}",
        encoding="utf-8",
    )
    monkeypatch.setattr(lr, "PROMPTS_DIR", fake_dir)
    monkeypatch.setattr(lr, "_PROMPT_TEMPLATE", lr._load_prompt_template())

    prompt = lr._build_prompt(_candidates(), _merged_prefs(), group_size=2, top_k=3)
    assert prompt.startswith("FAKE_TEMPLATE")


# ---------------------------------------------------------------------------
# Live integration test — runs only when explicitly enabled. Skipped in CI
# via `pytest -m "not live"` and skipped locally if OPENAI_API_KEY is unset.
# ---------------------------------------------------------------------------


@pytest.mark.live
def test_rerank_live_openai_call():
    if not os.getenv("OPENAI_API_KEY"):
        pytest.skip("OPENAI_API_KEY not set; skipping live test.")

    candidates = _candidates()
    picks, meta = lr.rerank_venues(candidates, _merged_prefs(), group_size=2, top_k=2)

    # Lenient check: real LLMs occasionally return fewer picks. As long as
    # we got at least one valid pick and well-formed metadata, we're good.
    assert 1 <= len(picks) <= 2
    assert all(p.name in {c["name"] for c in candidates} for p in picks)
    assert meta.input_tokens > 0
    assert meta.output_tokens > 0
    assert meta.cost_usd > 0
    assert meta.latency_ms > 0
