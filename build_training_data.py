"""
build_training_data.py
======================
Build a clean, model-ready training dataset from Plot's logs.

Pipeline
--------
1. Pull the join `recommendation_log ⟕ feedback` from Supabase via db.py.
2. Explode each recommendation's top-K venues so we have one row per
   (rec_id, venue_name) candidate.
3. Attach the user feedback signal (yay / nahh / visited / no-signal) to the
   matching candidate row.
4. Engineer the features the future ranker will need (rating, distance, budget
   gap, category overlap fraction, group size, etc.).
5. Write the result as `training_data/plot_training_<timestamp>.csv` and a
   "latest" symlink-style copy at `training_data/plot_training_latest.csv`.

Label semantics
---------------
    label = 1   if signal in {'yay', 'visited'}
    label = 0   if signal == 'nahh'
    label = NaN if no feedback (kept so we can do implicit-feedback experiments later)

How to run
----------
    # 1. make sure DATABASE_URL is set in .env or your shell
    python build_training_data.py
    # → training_data/plot_training_2026-04-25T01-12-44.csv
    # → training_data/plot_training_latest.csv

Wiring to MLflow (later)
------------------------
This script intentionally only *builds* the dataset. The training notebook /
script that consumes `plot_training_latest.csv` is where MLflow will live:

    import mlflow, pandas as pd, lightgbm as lgb
    df = pd.read_csv("training_data/plot_training_latest.csv").dropna(subset=["label"])
    with mlflow.start_run():
        mlflow.log_param("model", "lgbm_ranker_v1")
        # ... train, evaluate (NDCG@5), log metrics + model artifact ...

Keeping the dataset build separate from training means MLflow runs are
reproducible: you log which `plot_training_<timestamp>.csv` you trained on.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

OUT_DIR = Path(__file__).resolve().parent / "training_data"
BUDGET_RANK = {"low": 1, "medium": 2, "high": 3}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _coerce_json(value: Any) -> Any:
    """psycopg2 may return JSONB as either dict/list or as a JSON string."""
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return value


def _budget_gap(venue_price: str, merged_budget: str) -> int:
    return abs(BUDGET_RANK.get(venue_price, 2) - BUDGET_RANK.get(merged_budget, 2))


def _signal_to_label(signal: str | None) -> float | None:
    if signal is None:
        return None
    s = signal.lower()
    if s in {"yay", "visited"}:
        return 1.0
    if s == "nahh":
        return 0.0
    return None


# ---------------------------------------------------------------------------
# Core build
# ---------------------------------------------------------------------------

def build_rows() -> List[Dict[str, Any]]:
    """
    Pull rec_log ⟕ feedback rows and explode each recommendation's top-K venues
    into one row per (rec_id, venue_name) candidate, with engineered features.
    """
    from db import get_training_join  # local import: avoids requiring db at import-time

    raw = get_training_join()
    logger.info("Pulled %d joined rows from Supabase.", len(raw))

    out: List[Dict[str, Any]] = []
    for r in raw:
        rec_id            = r["rec_id"]
        merged_budget     = r["merged_budget"] or "medium"
        merged_max_dist   = float(r["merged_max_distance_km"] or 0.0)
        group_size        = int(r["group_size"] or 0)
        merged_categories = r["merged_categories"] or []
        # Prefer candidate_set (full v0 top-N including non-picked negatives).
        # Fall back to top_venues_payload for older rows logged before that
        # column existed — those only contain the final post-LLM top-K.
        candidate_set     = _coerce_json(r.get("candidate_set")) or []
        top_venues        = _coerce_json(r["top_venues_payload"]) or []
        venues_payload    = candidate_set if candidate_set else top_venues
        from_candidate_set = bool(candidate_set)
        llm_picks         = _coerce_json(r.get("llm_picks")) or []
        llm_pick_names    = {p.get("name") for p in llm_picks if isinstance(p, dict)}
        feedback_venue    = r["feedback_venue_name"]
        feedback_signal   = r["feedback_signal"]
        feedback_user     = r["feedback_user_id"]

        # If no venues were logged (older rows pre-migration), skip.
        if not venues_payload:
            continue

        for v in venues_payload:
            name      = v.get("name")
            category  = v.get("category", "")
            price     = v.get("price_level", "medium")
            rating    = float(v.get("rating") or 0.0)
            dist_km   = float(v.get("distance_km") or 0.0)
            score_at_rec = float(v.get("score") or 0.0)

            # Attach feedback only to the venue it was for; others get None.
            label = _signal_to_label(feedback_signal) if name == feedback_venue else None

            out.append({
                "rec_id":                rec_id,
                "rec_created_at":        r["rec_created_at"].isoformat() if r["rec_created_at"] else None,
                # group / request features
                "group_size":            group_size,
                "merged_budget":         merged_budget,
                "merged_max_distance_km": merged_max_dist,
                "n_categories":          len(merged_categories),
                # venue features
                "venue_name":            name,
                "category":              category,
                "price_level":           price,
                "rating":                rating,
                "distance_km":           dist_km,
                # engineered cross features
                "budget_gap":            _budget_gap(price, merged_budget),
                "category_in_group":     int(category in merged_categories),
                "distance_remaining_km": max(0.0, merged_max_dist - dist_km),
                # what the rules-based model predicted at the time
                "score_at_recommendation": score_at_rec,
                "model_version":         r.get("model_version") or "rules_v1",
                # which engine actually surfaced this row (for slicing during eval)
                "from_candidate_set":    int(from_candidate_set),
                "llm_picked":            int(name in llm_pick_names),
                # labels
                "feedback_user_id":      feedback_user,
                "feedback_signal":       feedback_signal,
                "label":                 label,   # 1 / 0 / None
            })

    return out


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def write_csv(rows: List[Dict[str, Any]]) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    snapshot = OUT_DIR / f"plot_training_{ts}.csv"
    latest   = OUT_DIR / "plot_training_latest.csv"

    try:
        import pandas as pd
        df = pd.DataFrame(rows)
        df.to_csv(snapshot, index=False)
        df.to_csv(latest,   index=False)
    except ImportError:
        # Tiny fallback so the script still works without pandas installed.
        import csv
        if not rows:
            snapshot.write_text("")
            latest.write_text("")
        else:
            fieldnames = list(rows[0].keys())
            for path in (snapshot, latest):
                with path.open("w", newline="") as f:
                    w = csv.DictWriter(f, fieldnames=fieldnames)
                    w.writeheader()
                    w.writerows(rows)

    return snapshot


# ---------------------------------------------------------------------------
# Quick summary so the user sees what they have
# ---------------------------------------------------------------------------

def summarize(rows: List[Dict[str, Any]]) -> None:
    n_total      = len(rows)
    n_labelled   = sum(1 for r in rows if r["label"] is not None)
    n_yay        = sum(1 for r in rows if r["label"] == 1.0)
    n_nahh       = sum(1 for r in rows if r["label"] == 0.0)
    n_unique_recs = len({r["rec_id"] for r in rows})

    print("\n=== Plot training set summary ===")
    print(f"  candidate rows : {n_total}")
    print(f"  unique recs    : {n_unique_recs}")
    print(f"  labelled rows  : {n_labelled}  ({n_yay} yay / {n_nahh} nahh)")
    print(f"  unlabelled rows: {n_total - n_labelled}")
    if n_labelled < 200:
        print("\n  Heads up: <200 labelled rows. Useful for sanity checks but")
        print("  not yet enough to train a serious ranker. Aim for ~500+.")
    print()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    if not os.environ.get("DATABASE_URL"):
        raise SystemExit(
            "DATABASE_URL is not set. Add it to your .env or export it before running."
        )

    rows = build_rows()
    if not rows:
        print("No rows found. Hit /recommend in the demo a few times first, then re-run.")
        return

    snapshot = write_csv(rows)
    summarize(rows)
    print(f"Wrote {len(rows)} rows to:")
    print(f"  {snapshot}")
    print(f"  {OUT_DIR / 'plot_training_latest.csv'}")
    print("\nNext: open `notebooks/train_ranker.ipynb` (TODO) and read plot_training_latest.csv,")
    print("then wrap the training run in `with mlflow.start_run(): ...` to start tracking.")


if __name__ == "__main__":
    main()
