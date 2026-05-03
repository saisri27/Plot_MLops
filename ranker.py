"""
Plot Ranker — load and score with the trained GradientBoostingClassifier
produced by notebooks/train_ranker.py.

Behavior:
    load_ranker()
        Returns (model, run_id_short, model_version_string) or (None, None, None)
        when joblib/sklearn aren't installed, no `models/plot_ranker_*.joblib`
        is found, or the file fails to load. The caller then falls back to v0.

    score_candidates(model, venues, merged, group_size)
        Returns one yay-probability per venue, in input order, or None on any
        failure. The caller should fall back to v0 when None is returned.

The feature columns mirror notebooks/train_ranker.py exactly. If you change
NUMERIC_FEATURES / CATEGORICAL_FEATURES there, change them here too.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

REPO_ROOT = Path(__file__).resolve().parent
MODELS_DIR = REPO_ROOT / "models"

NUMERIC_FEATURES = [
    "group_size",
    "merged_max_distance_km",
    "n_categories",
    "rating",
    "distance_km",
    "budget_gap",
    "category_in_group",
    "distance_remaining_km",
    "score_at_recommendation",
]
CATEGORICAL_FEATURES = ["merged_budget", "category", "price_level"]
FEATURE_COLUMNS = NUMERIC_FEATURES + CATEGORICAL_FEATURES

BUDGET_RANK = {"low": 1, "medium": 2, "high": 3}


def _budget_gap(venue_price: str, merged_budget: str) -> int:
    return abs(BUDGET_RANK.get(venue_price, 2) - BUDGET_RANK.get(merged_budget, 2))


def _resolve_model_path() -> Path | None:
    """RANKER_MODEL_PATH env var wins; else newest models/plot_ranker_*.joblib."""
    override = os.environ.get("RANKER_MODEL_PATH")
    if override:
        p = Path(override)
        return p if p.exists() else None

    if not MODELS_DIR.exists():
        return None
    candidates = sorted(
        MODELS_DIR.glob("plot_ranker_*.joblib"),
        key=lambda p: p.stat().st_mtime,
    )
    return candidates[-1] if candidates else None


def load_ranker() -> tuple[Any, str | None, str | None]:
    """
    Returns (model, run_id_short, model_version_string).
    Returns (None, None, None) when joblib/sklearn aren't installed, no model
    file exists on disk, or load fails. The caller falls back to v0.
    """
    try:
        import joblib  # local: keep imports cheap when ranker isn't used
    except ImportError:
        logger.info("joblib not installed — using v0 ranker.")
        return None, None, None

    path = _resolve_model_path()
    if path is None:
        logger.info("No trained ranker found in %s — using v0 ranker.", MODELS_DIR)
        return None, None, None

    try:
        model = joblib.load(path)
    except Exception as exc:
        logger.warning("Failed to load ranker from %s: %s — using v0 ranker.", path, exc)
        return None, None, None

    run_id = path.stem.removeprefix("plot_ranker_")
    run_id_short = run_id[:8] if run_id else None
    version = f"gbt_v1:{run_id_short}" if run_id_short else "gbt_v1"
    logger.info("Loaded ranker %s from %s", version, path)
    return model, run_id_short, version


def _build_feature_rows(
    venues: list[dict[str, Any]],
    merged: dict[str, Any],
    group_size: int,
) -> list[dict[str, Any]]:
    merged_budget = merged.get("merged_budget", "medium")
    merged_max_distance = float(merged.get("merged_max_distance", 0.0))
    merged_categories = merged.get("all_categories", []) or []
    n_categories = len(merged_categories)

    rows = []
    for v in venues:
        category = v.get("category", "")
        price = v.get("price_level", "medium")
        rating = float(v.get("rating") or 0.0)
        dist_km = float(v.get("distance_km") or 0.0)
        score_at_rec = float(v.get("score") or 0.0)
        rows.append(
            {
                "group_size": group_size,
                "merged_max_distance_km": merged_max_distance,
                "n_categories": n_categories,
                "rating": rating,
                "distance_km": dist_km,
                "budget_gap": _budget_gap(price, merged_budget),
                "category_in_group": int(category in merged_categories),
                "distance_remaining_km": max(0.0, merged_max_distance - dist_km),
                "score_at_recommendation": score_at_rec,
                "merged_budget": merged_budget,
                "category": category,
                "price_level": price,
            }
        )
    return rows


def score_candidates(
    model: Any,
    venues: list[dict[str, Any]],
    merged: dict[str, Any],
    group_size: int,
) -> list[float] | None:
    """
    Returns one yay-probability per venue, in input order. None on any failure
    so the caller can fall back to v0. Each venue must already have its v0
    `score` set — that's the `score_at_recommendation` feature the model expects.
    """
    try:
        import pandas as pd
    except ImportError:
        return None

    try:
        rows = _build_feature_rows(venues, merged, group_size)
        df = pd.DataFrame(rows, columns=FEATURE_COLUMNS)
        proba = model.predict_proba(df)[:, 1]
        return [float(p) for p in proba]
    except Exception as exc:
        logger.warning("Ranker scoring failed: %s — falling back to v0.", exc)
        return None
