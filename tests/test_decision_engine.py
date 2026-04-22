"""Unit tests for decision_engine.py — no network, no BigQuery, no DB."""

from __future__ import annotations

import sys
import types
from pathlib import Path
from unittest.mock import patch

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _stub_optional_modules() -> None:
    """Stub heavy/optional deps so importing decision_engine doesn't hit network."""
    if "google.cloud.bigquery" not in sys.modules:
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


_stub_optional_modules()

# Skip the whole module if FastAPI/Pydantic/dotenv aren't installed locally.
pytest.importorskip("fastapi")
pytest.importorskip("pydantic")
pytest.importorskip("dotenv")

import decision_engine as de  # noqa: E402


# ---------------------------------------------------------------------------
# budget_match_score
# ---------------------------------------------------------------------------

def test_budget_match_exact():
    assert de.budget_match_score("medium", "medium") == 1.0


def test_budget_match_one_tier_off():
    assert de.budget_match_score("low", "medium") == 0.5
    assert de.budget_match_score("high", "medium") == 0.5


def test_budget_match_two_tiers_off():
    assert de.budget_match_score("low", "high") == 0.0


# ---------------------------------------------------------------------------
# distance_score
# ---------------------------------------------------------------------------

def test_distance_score_within_range():
    assert de.distance_score(2.0, 10.0) == pytest.approx(0.8, rel=1e-3)


def test_distance_score_zero_when_beyond_max():
    assert de.distance_score(11.0, 10.0) == 0.0


def test_distance_score_at_max_is_zero():
    assert de.distance_score(10.0, 10.0) == 0.0


# ---------------------------------------------------------------------------
# merge_preferences
# ---------------------------------------------------------------------------

def _user(uid: str, budget: str, cats, dist):
    return de.UserPreference(
        user_id=uid, budget=budget, categories=cats, max_distance_km=dist
    )


def test_merge_picks_most_conservative_budget_and_min_distance():
    users = [
        _user("u1", "medium", ["Food & Drink"], 8.0),
        _user("u2", "low", ["Outdoors"], 3.0),
        _user("u3", "high", ["Food & Drink", "Entertainment"], 10.0),
    ]
    merged = de.merge_preferences(users)

    assert merged["merged_budget"] == "low"
    assert merged["merged_max_distance"] == 3.0
    assert set(merged["all_categories"]) == {
        "Food & Drink",
        "Outdoors",
        "Entertainment",
    }
    assert merged["category_weights"]["Food & Drink"] == pytest.approx(2 / 3)
    assert merged["category_weights"]["Outdoors"] == pytest.approx(1 / 3)


# ---------------------------------------------------------------------------
# compute_score
# ---------------------------------------------------------------------------

def test_compute_score_perfect_match_high_rating():
    venue = {
        "name": "X",
        "category": "Food & Drink",
        "rating": 5.0,
        "distance_km": 0.0,
        "price_level": "medium",
    }
    score, reason = de.compute_score(
        venue,
        merged_budget="medium",
        merged_max_distance=5.0,
        category_weights={"Food & Drink": 1.0},
    )
    # 0.4*1 + 0.25*1 + 0.2*1 + 0.15*1 = 1.0
    assert score == pytest.approx(1.0)
    assert "highly rated" in reason


def test_compute_score_out_of_range_distance_drops_distance_term():
    venue = {
        "category": "Outdoors",
        "rating": 4.0,
        "distance_km": 100.0,
        "price_level": "low",
    }
    score, _ = de.compute_score(
        venue,
        merged_budget="low",
        merged_max_distance=5.0,
        category_weights={"Outdoors": 1.0},
    )
    # distance term should be 0; rating 0.8, category 1.0, budget 1.0
    expected = 0.4 * 0.8 + 0.25 * 1.0 + 0.2 * 1.0 + 0.0
    assert score == pytest.approx(round(expected, 4))
