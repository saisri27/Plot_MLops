"""Unit tests for recommendation_bigquery.py — no real BigQuery calls."""

from __future__ import annotations

import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


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
# normalize_google_price_level
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw, expected",
    [
        (None, "medium"),
        ("low", "low"),
        ("MEDIUM", "medium"),
        ("PRICE_LEVEL_INEXPENSIVE", "low"),
        ("PRICE_LEVEL_FREE", "low"),
        ("PRICE_LEVEL_MODERATE", "medium"),
        ("PRICE_LEVEL_EXPENSIVE", "high"),
        ("PRICE_LEVEL_VERY_EXPENSIVE", "high"),
        ("UNKNOWN_BUCKET", "medium"),
    ],
)
def test_normalize_google_price_level(raw, expected):
    assert rb.normalize_google_price_level(raw) == expected


# ---------------------------------------------------------------------------
# fetch_venues_from_bigquery — mocked client
# ---------------------------------------------------------------------------

class _Row(dict):
    """Mimics google.cloud.bigquery Row (.items() works on dict already)."""


def _make_fake_client(rows):
    fake_query_result = MagicMock()
    fake_query_result.result.return_value = [_Row(r) for r in rows]
    fake_client = MagicMock()
    fake_client.query.return_value = fake_query_result
    return fake_client


def test_fetch_venues_returns_empty_list_when_no_categories():
    out = rb.fetch_venues_from_bigquery([], 5.0, client=_make_fake_client([]))
    assert out == []


def test_fetch_venues_normalizes_price_level_field():
    fake_rows = [
        {
            "name": "Cafe A",
            "category": "Food & Drink",
            "rating": 4.5,
            "distance_km": 1.2,
            "price_level": "PRICE_LEVEL_MODERATE",
            "latitude": 37.78,
            "longitude": -122.41,
            "google_maps_uri": "https://maps.example/a",
            "editorial_summary": None,
        }
    ]
    out = rb.fetch_venues_from_bigquery(
        ["Food & Drink"], 5.0, client=_make_fake_client(fake_rows)
    )
    assert len(out) == 1
    assert out[0]["price_level"] == "medium"
    assert out[0]["name"] == "Cafe A"
