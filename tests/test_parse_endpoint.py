"""
Tests for the /parse endpoint. Real OpenAI is never called — we monkeypatch
llm_intent.parse_intent so the FastAPI route still exercises end-to-end
serialization + fallback paths without a network dependency.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

import llm_intent
from decision_engine import app


def _fake_intent_meta() -> tuple[llm_intent.ParsedIntent, llm_intent.LLMIntentMetadata]:
    intent = llm_intent.ParsedIntent(
        budget="high",
        max_distance_km=8.0,
        categories=["Food & Drink", "Nightlife"],
    )
    meta = llm_intent.LLMIntentMetadata(
        model="gpt-4o-mini",
        prompt_version=llm_intent.PROMPT_VERSION,
        latency_ms=120,
        input_tokens=200,
        output_tokens=40,
        cost_usd=0.000054,
    )
    return intent, meta


def test_parse_returns_llm_result_when_available(monkeypatch):
    monkeypatch.setattr(llm_intent, "OPENAI_AVAILABLE", True)
    monkeypatch.setattr(llm_intent, "parse_intent", lambda *_a, **_kw: _fake_intent_meta())

    client = TestClient(app)
    resp = client.post("/parse", json={"free_text": "fancy cocktail night"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["budget"] == "high"
    assert body["max_distance_km"] == 8.0
    assert body["categories"] == ["Food & Drink", "Nightlife"]
    assert body["used_llm"] is True
    assert body["llm_model"] == "gpt-4o-mini"
    assert body["prompt_version"] == llm_intent.PROMPT_VERSION
    assert body["llm_latency_ms"] == 120
    assert body["llm_cost_usd"] == 0.000054


def test_parse_returns_defaults_when_openai_key_missing(monkeypatch):
    monkeypatch.setattr(llm_intent, "OPENAI_AVAILABLE", False)
    # parse_intent must not be called when OPENAI_AVAILABLE is False.
    def _boom(*_a, **_kw):
        raise AssertionError("parse_intent should not be called when OPENAI_AVAILABLE=False")
    monkeypatch.setattr(llm_intent, "parse_intent", _boom)

    client = TestClient(app)
    resp = client.post("/parse", json={"free_text": "anything"})
    assert resp.status_code == 200
    body = resp.json()
    d = llm_intent.DEFAULT_INTENT
    assert body["budget"] == d["budget"]
    assert body["max_distance_km"] == d["max_distance_km"]
    assert body["categories"] == list(d["categories"])
    assert body["used_llm"] is False
    assert body["llm_model"] is None


def test_parse_falls_back_to_defaults_on_llm_error(monkeypatch):
    monkeypatch.setattr(llm_intent, "OPENAI_AVAILABLE", True)

    def _raise(*_a, **_kw):
        raise llm_intent.LLMIntentError("simulated failure")
    monkeypatch.setattr(llm_intent, "parse_intent", _raise)

    client = TestClient(app)
    resp = client.post("/parse", json={"free_text": "anything"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["used_llm"] is False
    assert body["budget"] == llm_intent.DEFAULT_INTENT["budget"]


def test_parse_rejects_empty_input():
    client = TestClient(app)
    resp = client.post("/parse", json={"free_text": ""})
    # Pydantic min_length=1 on the request model enforces this at validation.
    assert resp.status_code == 422
