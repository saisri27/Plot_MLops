"""
Integration tests for /recommend with the LLM rerank wiring.

Both BigQuery (`fetch_venues_from_bigquery`) and the LLM call (`rerank_venues`)
are monkeypatched per-test to keep CI offline — no GCP credentials, no OpenAI
calls. The shared `offline_client` fixture handles the BQ patch (deterministic
across all tests); each test patches `rerank_venues` separately because each
test exercises a different LLM behavior (success / error / empty / spy).
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

import decision_engine  # noqa: E402
import llm_rerank  # noqa: E402
from decision_engine import app  # noqa: E402

# ---------------------------------------------------------------------------
# Fake venues — rich enough that v0 produces a stable top-N ordering
# ---------------------------------------------------------------------------

FAKE_VENUES: list[dict] = [
    {
        "name": "Dolores Park Cafe",
        "category": "Food & Drink",
        "rating": 4.6,
        "distance_km": 1.2,
        "price_level": "low",
        "google_maps_uri": None,
        "editorial_summary": None,
    },
    {
        "name": "Tartine Bakery",
        "category": "Food & Drink",
        "rating": 4.5,
        "distance_km": 1.5,
        "price_level": "medium",
        "google_maps_uri": None,
        "editorial_summary": None,
    },
    {
        "name": "Mission Bowling Club",
        "category": "Entertainment",
        "rating": 4.3,
        "distance_km": 2.1,
        "price_level": "medium",
        "google_maps_uri": None,
        "editorial_summary": None,
    },
    {
        "name": "Crissy Field",
        "category": "Outdoors",
        "rating": 4.8,
        "distance_km": 4.0,
        "price_level": "low",
        "google_maps_uri": None,
        "editorial_summary": None,
    },
    {
        "name": "Smuggler's Cove",
        "category": "Food & Drink",
        "rating": 4.7,
        "distance_km": 2.8,
        "price_level": "medium",
        "google_maps_uri": None,
        "editorial_summary": None,
    },
    {
        "name": "Golden Gate Park",
        "category": "Outdoors",
        "rating": 4.9,
        "distance_km": 4.5,
        "price_level": "low",
        "google_maps_uri": None,
        "editorial_summary": None,
    },
]


def _request_body(top_k: int = 3) -> dict:
    return {
        "users": [
            {
                "user_id": "u1",
                "budget": "medium",
                "categories": ["Food & Drink", "Outdoors"],
                "max_distance_km": 5.0,
            },
            {
                "user_id": "u2",
                "budget": "medium",
                "categories": ["Food & Drink"],
                "max_distance_km": 5.0,
            },
        ],
        "top_k": top_k,
    }


def _fake_meta(latency_ms: int = 250) -> llm_rerank.LLMRerankMetadata:
    return llm_rerank.LLMRerankMetadata(
        model="gpt-4o-mini",
        prompt_version=llm_rerank.PROMPT_VERSION,
        latency_ms=latency_ms,
        input_tokens=420,
        output_tokens=37,
        cost_usd=0.000085,
    )


@pytest.fixture
def offline_client(monkeypatch):
    """Patches BQ for all tests. Tests patch rerank_venues per-case."""
    # Lambda accepts both positional and keyword call styles so it doesn't
    # matter whether the engine ends up calling fetch_venues_from_bigquery
    # with positional args, kwargs, or a mix.
    monkeypatch.setattr(
        decision_engine,
        "fetch_venues_from_bigquery",
        lambda *a, **kw: FAKE_VENUES,
    )
    return TestClient(app)


# ---------------------------------------------------------------------------
# Happy path + LLM-engaged
# ---------------------------------------------------------------------------


def test_recommend_uses_llm_when_available(offline_client, monkeypatch):
    monkeypatch.setattr(llm_rerank, "OPENAI_AVAILABLE", True)

    def fake_rerank(candidates, merged, group_size, top_k, **kw):
        picks = [
            llm_rerank.LLMRerankResult(
                name=candidates[0]["name"], reason="best fit for the group", llm_rank=1
            ),
            llm_rerank.LLMRerankResult(
                name=candidates[1]["name"], reason="great backup", llm_rank=2
            ),
            llm_rerank.LLMRerankResult(
                name=candidates[2]["name"], reason="fun alt option", llm_rank=3
            ),
        ]
        return picks, _fake_meta()

    monkeypatch.setattr(llm_rerank, "rerank_venues", fake_rerank)

    resp = offline_client.post("/recommend", json=_request_body(top_k=3))
    assert resp.status_code == 200
    body = resp.json()
    assert body["used_llm"] is True
    assert body["llm_model"] == "gpt-4o-mini"
    assert body["prompt_version"] == llm_rerank.PROMPT_VERSION
    assert body["llm_latency_ms"] == 250
    assert len(body["recommendations"]) == 3
    # LLM-supplied reasons should propagate to the response.
    assert body["recommendations"][0]["reason"] == "best fit for the group"


# ---------------------------------------------------------------------------
# Hard-error fallback
# ---------------------------------------------------------------------------


def test_recommend_falls_back_to_v0_on_llm_error(offline_client, monkeypatch):
    monkeypatch.setattr(llm_rerank, "OPENAI_AVAILABLE", True)

    def boom(*a, **kw):
        raise llm_rerank.LLMRerankError("simulated timeout")

    monkeypatch.setattr(llm_rerank, "rerank_venues", boom)

    resp = offline_client.post("/recommend", json=_request_body(top_k=3))
    assert resp.status_code == 200
    body = resp.json()
    assert body["used_llm"] is False
    assert body["llm_model"] is None
    assert body["llm_latency_ms"] is None
    # v0 reasons (heuristic strings) come through, not LLM reasons.
    for rec in body["recommendations"]:
        assert rec["reason"] != "best fit for the group"


# ---------------------------------------------------------------------------
# Lenient-mode fallback: all picks hallucinated → empty list → v0 fallback
# ---------------------------------------------------------------------------


def test_recommend_falls_back_when_llm_returns_zero_picks(offline_client, monkeypatch):
    monkeypatch.setattr(llm_rerank, "OPENAI_AVAILABLE", True)
    monkeypatch.setattr(
        llm_rerank,
        "rerank_venues",
        lambda *a, **kw: ([], _fake_meta()),
    )

    resp = offline_client.post("/recommend", json=_request_body(top_k=3))
    assert resp.status_code == 200
    body = resp.json()
    assert body["used_llm"] is False
    assert len(body["recommendations"]) == 3


# ---------------------------------------------------------------------------
# Response schema check
# ---------------------------------------------------------------------------


def test_recommend_response_includes_llm_fields(offline_client, monkeypatch):
    monkeypatch.setattr(llm_rerank, "OPENAI_AVAILABLE", False)

    resp = offline_client.post("/recommend", json=_request_body(top_k=3))
    assert resp.status_code == 200
    body = resp.json()
    # All new fields must be present, even when LLM was skipped.
    for field in (
        "used_llm",
        "llm_model",
        "prompt_version",
        "llm_latency_ms",
        "recommendation_log_id",
    ):
        assert field in body, f"missing field: {field}"
    assert isinstance(body["used_llm"], bool)


# ---------------------------------------------------------------------------
# Engine passes correct candidate set to the LLM
# ---------------------------------------------------------------------------


def test_recommend_passes_v0_top_n_to_llm(offline_client, monkeypatch):
    monkeypatch.setattr(llm_rerank, "OPENAI_AVAILABLE", True)
    captured: dict = {}

    def spy_rerank(candidates, merged, group_size, top_k, **kw):
        captured["candidates"] = candidates
        captured["top_k"] = top_k
        captured["group_size"] = group_size
        # Return one valid pick so the response reflects used_llm=True.
        return (
            [llm_rerank.LLMRerankResult(name=candidates[0]["name"], reason="ok", llm_rank=1)],
            _fake_meta(),
        )

    monkeypatch.setattr(llm_rerank, "rerank_venues", spy_rerank)

    resp = offline_client.post("/recommend", json=_request_body(top_k=3))
    assert resp.status_code == 200

    # Candidates passed to the LLM must be v0-sorted (descending by score)
    # and capped at TOP_N_FOR_LLM (20).
    assert "candidates" in captured
    cand = captured["candidates"]
    assert len(cand) <= decision_engine.TOP_N_FOR_LLM
    scores = [c["score"] for c in cand]
    assert scores == sorted(scores, reverse=True)
    assert captured["top_k"] == 3
    assert captured["group_size"] == 2


# ---------------------------------------------------------------------------
# OPENAI_AVAILABLE=False short-circuits the LLM call entirely
# ---------------------------------------------------------------------------


def test_recommend_skips_llm_when_openai_unavailable(offline_client, monkeypatch):
    monkeypatch.setattr(llm_rerank, "OPENAI_AVAILABLE", False)
    called = {"n": 0}

    def should_not_be_called(*a, **kw):
        called["n"] += 1
        raise AssertionError("rerank_venues should NOT be called when OPENAI_AVAILABLE=False")

    monkeypatch.setattr(llm_rerank, "rerank_venues", should_not_be_called)

    resp = offline_client.post("/recommend", json=_request_body(top_k=3))
    assert resp.status_code == 200
    assert called["n"] == 0
    body = resp.json()
    assert body["used_llm"] is False
