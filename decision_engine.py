"""
Plot Decision Engine — FastAPI
==============================
Endpoints:
  GET  /          → health check
  GET  /health    → health check
  POST /recommend → main recommendation (BigQuery-wired, group-aware)
  POST /feedback  → log accepted/rejected venue (feeds retraining loop)

Group preference merging logic:
  - budget       : most conservative (lowest) across all users
  - max_distance : smallest across all users (respect whoever travels least)
  - categories   : union of all users' categories, each weighted by
                   how many users want it → category score = avg match fraction
"""

from __future__ import annotations

import logging
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()  # loads .env from project root automatically

from recommendation_bigquery import fetch_venues_from_bigquery

# Optional: Neon/Postgres feedback logging (gracefully skipped if DB not configured)
try:
    from db import log_feedback, log_recommendation_request
    DB_AVAILABLE = True
except Exception:
    DB_AVAILABLE = False  # Set DATABASE_URL (Supabase) to enable

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Plot Decision Engine",
    description="Recommends venues and events for group hangouts",
    version="0.3.0",
)

# Permissive CORS for local demo pages (demo.html). Tighten in production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Request / Response Models
# ---------------------------------------------------------------------------

BUDGET_RANK = {"low": 1, "medium": 2, "high": 3}


class UserPreference(BaseModel):
    user_id: str = Field(..., description="Unique user identifier")
    budget: str = Field(..., description="One of: low, medium, high")
    categories: List[str] = Field(..., description="e.g. ['Food & Drink', 'Outdoors']")
    max_distance_km: float = Field(..., gt=0, description="Max travel distance in km")


class RecommendRequest(BaseModel):
    users: List[UserPreference] = Field(..., min_length=1, description="1–N users in the group")
    top_k: int = Field(default=5, ge=1, le=20, description="How many results to return")


class VenueResult(BaseModel):
    name: str
    category: str
    rating: float
    distance_km: float
    price_level: str
    score: float
    reason: str
    google_maps_uri: Optional[str] = None
    editorial_summary: Optional[str] = None


class RecommendResponse(BaseModel):
    merged_budget: str
    merged_max_distance_km: float
    merged_categories: List[str]
    group_size: int
    venues_scored: int
    recommendations: List[VenueResult]


class FeedbackRequest(BaseModel):
    user_id: str
    venue_name: str
    accepted: bool = Field(..., description="True = user accepted, False = rejected")
    request_context: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Group Preference Merging
# ---------------------------------------------------------------------------

def merge_preferences(users: List[UserPreference]) -> dict:
    """
    Merge N users' preferences into one set of query parameters.

    Returns:
        merged_budget        : str  — most conservative budget
        merged_max_distance  : float — smallest max_distance_km
        category_weights     : dict  — {category: fraction_of_users_who_want_it}
        all_categories       : list  — union of all categories (for BQ query)
    """
    # Budget: take the most conservative (lowest rank) across all users
    merged_budget = min(
        (u.budget for u in users),
        key=lambda b: BUDGET_RANK.get(b, 2),
    )

    # Distance: take the minimum (respect whoever travels least)
    merged_max_distance = min(u.max_distance_km for u in users)

    # Categories: union with weights (how many users want each category)
    category_counts: Dict[str, int] = {}
    for user in users:
        for cat in user.categories:
            category_counts[cat] = category_counts.get(cat, 0) + 1

    n = len(users)
    category_weights = {cat: count / n for cat, count in category_counts.items()}
    all_categories = list(category_counts.keys())

    return {
        "merged_budget": merged_budget,
        "merged_max_distance": merged_max_distance,
        "category_weights": category_weights,
        "all_categories": all_categories,
    }


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def budget_match_score(venue_price: str, user_budget: str) -> float:
    """
    1.0  → exact match
    0.5  → one tier off
    0.0  → two tiers off (e.g. low vs high)
    """
    vr = BUDGET_RANK.get(venue_price, 2)
    ur = BUDGET_RANK.get(user_budget, 2)
    diff = abs(vr - ur)
    if diff == 0:
        return 1.0
    if diff == 1:
        return 0.5
    return 0.0


def distance_score(distance_km: float, max_distance_km: float) -> float:
    """Closer = higher score. Returns 0 if beyond max_distance."""
    if distance_km > max_distance_km:
        return 0.0
    return round(1.0 - (distance_km / max_distance_km), 4)


def compute_score(
    venue: Dict[str, Any],
    merged_budget: str,
    merged_max_distance: float,
    category_weights: Dict[str, float],
) -> tuple[float, str]:
    """
    Weighted scoring formula:
      40% rating
      25% category match (group-weighted — partial credit if some users want it)
      20% budget match
      15% proximity

    Returns (score: float, reason: str)
    """
    rating_component    = (venue.get("rating") or 0.0) / 5.0
    category_component  = category_weights.get(venue.get("category", ""), 0.0)
    budget_component    = budget_match_score(venue.get("price_level", "medium"), merged_budget)
    distance_component  = distance_score(venue.get("distance_km", 999), merged_max_distance)

    total = (
        0.40 * rating_component
        + 0.25 * category_component
        + 0.20 * budget_component
        + 0.15 * distance_component
    )

    # Build human-readable reason string
    reasons = []
    if category_component == 1.0:
        reasons.append("all group members want this category")
    elif category_component > 0:
        pct = int(category_component * 100)
        reasons.append(f"{pct}% of group wants this category")
    if budget_component == 1.0:
        reasons.append("matches group budget")
    elif budget_component == 0.5:
        reasons.append("close to group budget")
    if distance_component > 0.7:
        reasons.append("very close by")
    elif distance_component > 0:
        reasons.append("within travel range")
    if rating_component >= 0.88:  # rating ≥ 4.4
        reasons.append("highly rated")

    reason = ", ".join(reasons) if reasons else "best available overall match"
    return round(total, 4), reason


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Plot Decision Engine is running", "version": "0.3.0"}


@app.get("/health")
def health():
    return {"status": "healthy", "db_available": DB_AVAILABLE}


@app.post("/recommend", response_model=RecommendResponse)
def recommend(request: RecommendRequest):
    """
    Main recommendation endpoint.

    Send one or more users' preferences → get back ranked venues from BigQuery.

    Example body (single user):
    {
      "users": [
        {
          "user_id": "user_001",
          "budget": "medium",
          "categories": ["Food & Drink", "Outdoors"],
          "max_distance_km": 5.0
        }
      ],
      "top_k": 5
    }

    Example body (group of 3):
    {
      "users": [
        {"user_id": "u1", "budget": "low",    "categories": ["Food & Drink"], "max_distance_km": 3.0},
        {"user_id": "u2", "budget": "medium", "categories": ["Outdoors"],     "max_distance_km": 6.0},
        {"user_id": "u3", "budget": "medium", "categories": ["Food & Drink", "Entertainment"], "max_distance_km": 5.0}
      ],
      "top_k": 5
    }
    """
    # 1. Merge group preferences
    merged = merge_preferences(request.users)
    merged_budget       = merged["merged_budget"]
    merged_max_distance = merged["merged_max_distance"]
    category_weights    = merged["category_weights"]
    all_categories      = merged["all_categories"]

    logger.info(
        "Recommend request | group_size=%d | budget=%s | max_dist=%.1f km | categories=%s",
        len(request.users), merged_budget, merged_max_distance, all_categories,
    )

    # 2. Fetch venues from BigQuery
    try:
        venues = fetch_venues_from_bigquery(
            categories=all_categories,
            max_distance_km=merged_max_distance,
        )
    except Exception as exc:
        logger.exception("BigQuery fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"BigQuery error: {exc}")

    if not venues:
        return RecommendResponse(
            merged_budget=merged_budget,
            merged_max_distance_km=merged_max_distance,
            merged_categories=all_categories,
            group_size=len(request.users),
            venues_scored=0,
            recommendations=[],
        )

    # 3. Score every venue
    scored: List[Dict[str, Any]] = []
    for venue in venues:
        score, reason = compute_score(
            venue, merged_budget, merged_max_distance, category_weights
        )
        scored.append({**venue, "score": score, "reason": reason})

    # 4. Rank and return top_k
    ranked = sorted(scored, key=lambda v: v["score"], reverse=True)
    top = ranked[: request.top_k]

    # 5. Optionally log request to DB for analytics / retraining
    if DB_AVAILABLE:
        try:
            log_recommendation_request(
                user_ids=[u.user_id for u in request.users],
                merged_budget=merged_budget,
                categories=all_categories,
                top_venue_names=[v["name"] for v in top],
            )
        except Exception as exc:
            logger.warning("DB log failed (non-fatal): %s", exc)

    return RecommendResponse(
        merged_budget=merged_budget,
        merged_max_distance_km=merged_max_distance,
        merged_categories=all_categories,
        group_size=len(request.users),
        venues_scored=len(scored),
        recommendations=[VenueResult(**v) for v in top],
    )


@app.post("/feedback")
def feedback(request: FeedbackRequest):
    """
    Log whether a user accepted or rejected a venue recommendation.
    This feeds the retraining loop — stored in Neon Postgres.

    Example:
    {
      "user_id": "user_001",
      "venue_name": "Dolores Park Cafe",
      "accepted": true
    }
    """
    if not DB_AVAILABLE:
        logger.warning("Feedback received but DB not configured — skipping.")
        return {"status": "accepted", "stored": False, "note": "DB not configured"}

    try:
        log_feedback(
            user_id=request.user_id,
            venue_name=request.venue_name,
            accepted=request.accepted,
            context=request.request_context or {},
        )
        return {"status": "accepted", "stored": True}
    except Exception as exc:
        logger.exception("Failed to log feedback: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}")
