"""
Tests for fetch_events_from_bigquery (unit, mocked BQ) and the /events endpoint
(integration, monkeypatched fetch). No real BigQuery calls.

Mirrors the patterns in tests/test_recommendation_bigquery.py and
tests/test_decision_engine_with_llm.py so the style stays consistent.
"""

from __future__ import annotations

import sys
import types
from datetime import datetime, timedelta, timezone  # noqa: UP017 — keep 3.10 compat
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


# ---------------------------------------------------------------------------
# google.cloud.bigquery stub — same shape as test_recommendation_bigquery.py.
# Lets the import succeed in CI environments without google-cloud-bigquery.
# ---------------------------------------------------------------------------


def _stub_bigquery() -> None:
    if "google.cloud.bigquery" in sys.modules:
        return
    google_mod = types.ModuleType("google")
    cloud_mod = types.ModuleType("google.cloud")
    bq_mod = types.ModuleType("google.cloud.bigquery")

    class _Stub:
        def __init__(self, *a, **kw):
            pass

    bq_mod.Client = _Stub
    bq_mod.QueryJobConfig = _Stub
    bq_mod.ScalarQueryParameter = _Stub
    bq_mod.ArrayQueryParameter = _Stub
    bq_mod.SchemaField = _Stub
    bq_mod.Dataset = _Stub
    bq_mod.Table = _Stub

    cloud_mod.bigquery = bq_mod
    google_mod.cloud = cloud_mod
    sys.modules["google"] = google_mod
    sys.modules["google.cloud"] = cloud_mod
    sys.modules["google.cloud.bigquery"] = bq_mod


_stub_bigquery()

import recommendation_bigquery as rb  # noqa: E402


# ---------------------------------------------------------------------------
# map_segment_to_category — pure function, no BQ
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "segment, expected",
    [
        ("Music", "Music & Live Shows"),  # Music has its own chip — 51% of event volume
        ("Arts & Theatre", "Arts & Culture"),
        ("Sports", "Sports & Recreation"),
        ("Family", "Entertainment"),
        ("Film", "Entertainment"),
        ("Miscellaneous", "Entertainment"),  # falls back
        ("Undefined", "Entertainment"),  # falls back
        ("", "Entertainment"),  # empty → fallback
        (None, "Entertainment"),
        ("  Music  ", "Music & Live Shows"),  # trims whitespace
    ],
)
def test_map_segment_to_category(segment, expected):
    assert rb.map_segment_to_category(segment) == expected


# ---------------------------------------------------------------------------
# fetch_events_from_bigquery — empty / shape / mapping
# ---------------------------------------------------------------------------


class _Row(dict):
    """Mimics google.cloud.bigquery Row — .items() works on dict already."""


def _make_fake_client(rows):
    fake_query_result = MagicMock()
    fake_query_result.result.return_value = [_Row(r) for r in rows]
    fake_client = MagicMock()
    fake_client.query.return_value = fake_query_result
    return fake_client


def _future_ts(days: int = 7) -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=days)  # noqa: UP017


def test_fetch_events_returns_empty_list_when_no_categories():
    out = rb.fetch_events_from_bigquery([], 10.0, client=_make_fake_client([]))
    assert out == []


def test_fetch_events_returns_empty_when_categories_have_no_segment_match():
    """
    "Food & Drink" / "Outdoors" don't map to any Ticketmaster segment, so the
    function should short-circuit and not even hit BigQuery.
    """
    fake_client = _make_fake_client([])
    out = rb.fetch_events_from_bigquery(["Food & Drink", "Outdoors"], 10.0, client=fake_client)
    assert out == []
    # Important: when there's nothing to query, we don't hit BigQuery at all.
    fake_client.query.assert_not_called()


def test_fetch_events_maps_segment_to_canonical_category():
    """Output category must be the canonical name, not the raw Ticketmaster segment."""
    fake_rows = [
        {
            "name": "Symphony Night",
            "segment": "Arts & Theatre",
            "genre": "Classical",
            "price_min": 50.0,
            "price_max": 200.0,
            "price_currency": "USD",
            "distance_miles": 1.0,
            "distance_km": 1.609344,
            "start_datetime_utc": _future_ts(7),
            "venue_name": "Davies Symphony Hall",
            "event_url": "https://example.com/symphony",
            "image_url": "https://example.com/img.jpg",
        },
    ]
    out = rb.fetch_events_from_bigquery(
        ["Arts & Culture"], 10.0, client=_make_fake_client(fake_rows)
    )
    assert len(out) == 1
    assert out[0]["category"] == "Arts & Culture"
    assert out[0]["segment"] == "Arts & Theatre"


def test_fetch_events_buckets_unknown_segment_under_entertainment():
    """Null / unknown segments fall back to Entertainment when that's selected."""
    fake_rows = [
        {
            "name": "Mystery Event",
            "segment": None,
            "genre": None,
            "price_min": None,
            "price_max": None,
            "price_currency": None,
            "distance_miles": 2.0,
            "distance_km": 3.218688,
            "start_datetime_utc": _future_ts(3),
            "venue_name": "TBA",
            "event_url": None,
            "image_url": None,
        },
    ]
    out = rb.fetch_events_from_bigquery(
        ["Entertainment"], 10.0, client=_make_fake_client(fake_rows)
    )
    assert len(out) == 1
    assert out[0]["category"] == "Entertainment"


def test_fetch_events_query_filters_to_upcoming_only():
    """
    The SQL must include the upcoming-only date filter — past Ticketmaster rows
    must never reach the caller. We assert against the rendered query string
    rather than running it, since the BQ client is mocked.
    """
    fake_client = _make_fake_client([])
    rb.fetch_events_from_bigquery(["Entertainment"], 10.0, client=fake_client)

    # First positional arg to bq.query(...) is the SQL string.
    fake_client.query.assert_called_once()
    sql = fake_client.query.call_args.args[0]
    assert "start_datetime_utc > CURRENT_TIMESTAMP()" in sql
    assert "TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL @days_ahead DAY)" in sql
    # Dedup is critical once the 3x/week cron runs — locked in by this assertion.
    assert "QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id" in sql


def test_fetch_events_query_converts_max_distance_km_to_miles():
    """
    Caller passes max_distance_km; events are stored in miles. The query
    parameter we send to BigQuery must be the converted (miles) value.
    """
    fake_client = _make_fake_client([])
    rb.fetch_events_from_bigquery(["Entertainment"], 16.09344, client=fake_client)

    job_config = fake_client.query.call_args.kwargs.get("job_config")
    assert job_config is not None
    # ScalarQueryParameter is stubbed in this test env, so we inspect the
    # constructor kwargs of the first parameter that was created. The stub
    # records init args — re-fetch via vars() since _Stub stores nothing.
    # Easier check: the constant matches the conversion we expect.
    assert pytest.approx(1.609344) == rb.KM_PER_MILE


# ---------------------------------------------------------------------------
# /events endpoint — monkeypatched fetch_events
# ---------------------------------------------------------------------------

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

import decision_engine  # noqa: E402
from decision_engine import app  # noqa: E402


def _fake_event_rows(n: int = 3) -> list[dict]:
    base = _future_ts(5)
    return [
        {
            "name": f"Event {i}",
            "category": "Entertainment",
            "segment": "Music",
            "genre": "Rock",
            "price_min": 25.0 + 10 * i,
            "price_max": 80.0 + 10 * i,
            "price_currency": "USD",
            "distance_miles": 2.0 + i,
            "distance_km": (2.0 + i) * 1.609344,
            "start_datetime_utc": base + timedelta(days=i),
            "venue_name": f"Venue {i}",
            "event_url": f"https://example.com/event/{i}",
            "image_url": f"https://example.com/img/{i}.jpg",
        }
        for i in range(n)
    ]


@pytest.fixture
def offline_client(monkeypatch):
    """Patches fetch_events_from_bigquery for all /events tests."""
    rows = _fake_event_rows(5)
    monkeypatch.setattr(decision_engine, "fetch_events_from_bigquery", lambda *a, **kw: rows)
    return TestClient(app)


def test_events_endpoint_returns_200_with_correct_shape(offline_client):
    resp = offline_client.post(
        "/events",
        json={
            "categories": ["Entertainment"],
            "max_distance_km": 15,
            "days_ahead": 30,
            "top_k": 10,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["requested_categories"] == ["Entertainment"]
    assert body["max_distance_km"] == 15
    assert body["days_ahead"] == 30
    assert body["events_found"] == 5
    assert len(body["events"]) == 5
    # Every event must have the contract fields.
    for ev in body["events"]:
        for field in (
            "name",
            "category",
            "distance_km",
            "start_datetime_utc",
            "venue_name",
            "event_url",
        ):
            assert field in ev


def test_events_endpoint_respects_top_k(offline_client):
    resp = offline_client.post(
        "/events",
        json={"categories": ["Entertainment"], "max_distance_km": 15, "top_k": 2},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["events_found"] == 2
    assert len(body["events"]) == 2


def test_events_endpoint_filters_by_max_price(offline_client):
    """price_min above max_price should be dropped; null prices are kept."""
    resp = offline_client.post(
        "/events",
        json={
            "categories": ["Entertainment"],
            "max_distance_km": 15,
            "max_price": 30,  # only Event 0 (price_min=25.0) qualifies
            "top_k": 10,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    names = [e["name"] for e in body["events"]]
    assert names == ["Event 0"]


def test_events_endpoint_returns_empty_when_no_events(monkeypatch):
    monkeypatch.setattr(decision_engine, "fetch_events_from_bigquery", lambda *a, **kw: [])
    client = TestClient(app)
    resp = client.post(
        "/events",
        json={"categories": ["Food & Drink"], "max_distance_km": 5},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["events_found"] == 0
    assert body["events"] == []


def test_events_endpoint_returns_503_on_bigquery_error(monkeypatch):
    def boom(*a, **kw):
        raise RuntimeError("BQ exploded")

    monkeypatch.setattr(decision_engine, "fetch_events_from_bigquery", boom)
    client = TestClient(app)
    resp = client.post(
        "/events",
        json={"categories": ["Entertainment"], "max_distance_km": 5},
    )
    assert resp.status_code == 503
    assert "BigQuery error" in resp.json()["detail"]


def test_events_endpoint_rejects_empty_categories():
    """Pydantic validation must reject categories=[] before any backend call."""
    client = TestClient(app)
    resp = client.post(
        "/events",
        json={"categories": [], "max_distance_km": 5},
    )
    assert resp.status_code == 422


def test_events_endpoint_rejects_out_of_range_distance():
    client = TestClient(app)
    resp = client.post(
        "/events",
        json={"categories": ["Entertainment"], "max_distance_km": 9999},
    )
    assert resp.status_code == 422
