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

import json
import logging
from dataclasses import dataclass, field
from typing import Any

from dotenv import load_dotenv

load_dotenv()  # loads .env from project root automatically; must run before modules
# below that read env vars at import time (recommendation_bigquery, db).

from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from fastapi import FastAPI, HTTPException  # noqa: E402
from recommendation_bigquery import (  # noqa: E402
    fetch_events_from_bigquery,
    fetch_venues_from_bigquery,
)

# Module-level import (NOT `from llm_rerank import ...`) so test monkeypatches
# of llm_rerank.OPENAI_AVAILABLE / llm_rerank.rerank_venues actually propagate
# to the names this module reads at call time.
import llm_rerank  # noqa: E402
import llm_intent  # noqa: E402

try:
    from db import (  # noqa: E402
        create_group,
        get_group,
        get_group_by_token,
        get_user,
        join_group,
        list_user_groups,
        log_feedback,
        log_recommendation_request,
        record_group_vote,
        save_user_profile,
        set_member_prefs,
        update_group_last_rec,
        upsert_user,
    )

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
    categories: list[str] = Field(..., description="e.g. ['Food & Drink', 'Outdoors']")
    max_distance_km: float = Field(..., gt=0, description="Max travel distance in km")


class RecommendRequest(BaseModel):
    users: list[UserPreference] = Field(..., min_length=1, description="1–N users in the group")
    top_k: int = Field(default=5, ge=1, le=20, description="How many results to return")


class VenueResult(BaseModel):
    name: str
    category: str
    rating: float
    distance_km: float
    price_level: str
    score: float
    reason: str
    google_maps_uri: str | None = None
    editorial_summary: str | None = None


class RecommendResponse(BaseModel):
    rec_id: int | None = Field(
        default=None,
        description="ID of the recommendation_log row this response was logged to. "
        "Pass back to /feedback so we can join feedback ↔ exact rec.",
    )
    merged_budget: str
    merged_max_distance_km: float
    merged_categories: list[str]
    group_size: int
    venues_scored: int
    model_version: str = "rules_v1"
    recommendations: list[VenueResult]
    # LLM rerank metadata. None when LLM was unavailable or failed → v0 fallback.
    used_llm: bool = False
    llm_model: str | None = None
    prompt_version: str | None = None
    llm_latency_ms: int | None = None


class ParseIntentRequest(BaseModel):
    free_text: str = Field(
        ..., min_length=1, description="Natural-language vibe, e.g. 'chill cocktail night'"
    )


class ParseIntentResponse(BaseModel):
    budget: str
    max_distance_km: float
    categories: list[str]
    used_llm: bool = False
    llm_model: str | None = None
    prompt_version: str | None = None
    llm_latency_ms: int | None = None
    llm_cost_usd: float | None = None


class EventsRequest(BaseModel):
    categories: list[str] = Field(
        ..., min_length=1, description="Canonical category chips selected by the user"
    )
    max_distance_km: float = Field(default=10.0, gt=0, le=50.0)
    days_ahead: int = Field(
        default=60, ge=1, le=365, description="Only events starting within N days"
    )
    max_price: float | None = Field(
        default=None, ge=0, description="Drop events with price_min above this; None = no cap"
    )
    top_k: int = Field(default=10, ge=1, le=50)


class EventResult(BaseModel):
    name: str
    category: str
    segment: str | None = None
    genre: str | None = None
    distance_km: float
    start_datetime_utc: str
    venue_name: str | None = None
    event_url: str | None = None
    image_url: str | None = None
    price_min: float | None = None
    price_max: float | None = None
    price_currency: str | None = None


class EventsResponse(BaseModel):
    requested_categories: list[str]
    max_distance_km: float
    days_ahead: int
    events_found: int
    events: list[EventResult]


class UserProfileRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    pronouns: str | None = Field(default=None, max_length=40)
    date_of_birth: str | None = Field(
        default=None,
        description="ISO 8601 date string (YYYY-MM-DD), or None to leave unset.",
    )


class CreateGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    creator_user_id: str = Field(..., min_length=1, description="The host's device user_id")
    creator_display_name: str | None = Field(
        default=None, description="Optional display name for the host"
    )


class JoinGroupRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    display_name: str = Field(..., min_length=1, max_length=40)


class SetGroupPrefsRequest(BaseModel):
    user_id: str
    budget: str = Field(..., description="One of: low, medium, high")
    categories: list[str] = Field(..., min_length=1)
    max_distance_km: float = Field(..., gt=0, le=50)


class GroupVoteRequest(BaseModel):
    user_id: str
    venue_name: str
    signal: str = Field(..., description="One of: yay, nahh")


class GroupRecommendRequest(BaseModel):
    requested_by: str = Field(..., description="Member's user_id who tapped 'Get recs'")
    top_k: int = Field(default=5, ge=1, le=20)


class FeedbackRequest(BaseModel):
    user_id: str
    venue_name: str
    signal: str = Field(
        default="yay",
        description="One of: 'yay' (liked), 'nahh' (rejected), 'visited' (actually went)",
    )
    rec_id: int | None = Field(
        default=None,
        description="ID returned from /recommend so feedback links back to the exact request.",
    )
    request_context: dict[str, Any] | None = None


# ---------------------------------------------------------------------------
# Group Preference Merging
# ---------------------------------------------------------------------------


def merge_preferences(users: list[UserPreference]) -> dict:
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
    category_counts: dict[str, int] = {}
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
    venue: dict[str, Any],
    merged_budget: str,
    merged_max_distance: float,
    category_weights: dict[str, float],
) -> tuple[float, str]:
    """
    Weighted scoring formula:
      40% rating
      25% category match (group-weighted — partial credit if some users want it)
      20% budget match
      15% proximity

    Returns (score: float, reason: str)
    """
    rating_component = (venue.get("rating") or 0.0) / 5.0
    category_component = category_weights.get(venue.get("category", ""), 0.0)
    budget_component = budget_match_score(venue.get("price_level", "medium"), merged_budget)
    distance_component = distance_score(venue.get("distance_km", 999), merged_max_distance)

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
# LLM rerank merging
# ---------------------------------------------------------------------------

# How many v0 candidates are sent to the LLM. The LLM picks top_k of these.
TOP_N_FOR_LLM = 20


@dataclass
class _LLMRerankOutcome:
    """
    Resolved output of the optional LLM rerank step. Always includes a `final`
    list — either the LLM's reordered picks or the v0 top-K fallback — and the
    metadata the endpoint needs for both the response and the DB log.
    Encapsulating it lets the orchestrator stay flat instead of juggling six
    parallel optional variables.
    """

    final: list[dict[str, Any]]
    used_llm: bool = False
    llm_model: str | None = None
    prompt_version: str | None = None
    llm_latency_ms: int | None = None
    llm_cost_usd: float | None = None
    llm_picks_payload: list[dict[str, Any]] = field(default_factory=list)


def _score_and_rank(
    venues: list[dict[str, Any]],
    merged_budget: str,
    merged_max_distance: float,
    category_weights: dict[str, float],
) -> list[dict[str, Any]]:
    """v0 weighted-score every venue, attach `score` + `reason`, sort desc."""
    scored: list[dict[str, Any]] = []
    for venue in venues:
        score, reason = compute_score(venue, merged_budget, merged_max_distance, category_weights)
        scored.append({**venue, "score": score, "reason": reason})
    return sorted(scored, key=lambda v: v["score"], reverse=True)


def _run_llm_rerank(
    candidates: list[dict[str, Any]],
    merged: dict,
    group_size: int,
    top_k: int,
) -> _LLMRerankOutcome:
    """
    Optional LLM rerank with full v0 fallback. Returns a populated outcome
    no matter what — the caller never has to branch on missing keys.

    Falls back to v0 (used_llm=False) when:
      - OPENAI_API_KEY is missing (`llm_rerank.OPENAI_AVAILABLE` is False)
      - The LLM call raises `LLMRerankError` (timeout, malformed JSON, etc.)
      - The LLM returns 0 valid picks (every pick was hallucinated)
    """
    fallback = _LLMRerankOutcome(final=candidates[:top_k])

    if not llm_rerank.OPENAI_AVAILABLE:
        return fallback

    try:
        llm_picks, llm_meta = llm_rerank.rerank_venues(candidates, merged, group_size, top_k)
    except llm_rerank.LLMRerankError as exc:
        logger.warning("LLM rerank failed, falling back to v0: %s", exc)
        return fallback

    if not llm_picks:
        logger.warning("LLM returned 0 valid picks; falling back to v0.")
        return fallback

    return _LLMRerankOutcome(
        final=_merge_llm_picks(llm_picks, candidates),
        used_llm=True,
        llm_model=llm_meta.model,
        prompt_version=llm_meta.prompt_version,
        llm_latency_ms=llm_meta.latency_ms,
        llm_cost_usd=llm_meta.cost_usd,
        llm_picks_payload=[p.model_dump() for p in llm_picks],
    )


def _log_recommend_best_effort(
    request: RecommendRequest,
    merged_budget: str,
    merged_max_distance: float,
    all_categories: list[str],
    candidates: list[dict[str, Any]],
    outcome: _LLMRerankOutcome,
    effective_model_version: str,
) -> int | None:
    """
    Best-effort write of one /recommend call to Supabase. Returns the new
    rec_id, or None on any failure (so the endpoint still returns 200).
    Splitting the DB-log step out of the orchestrator means the happy path
    in `recommend()` no longer has two layers of nested try/except.
    """
    if not DB_AVAILABLE:
        return None

    # Best-effort: ensure each user_id exists in `users` so future joins /
    # dashboards have something to reference. Failures are non-fatal.
    for u in request.users:
        try:
            upsert_user(
                user_id=u.user_id,
                default_budget=u.budget,
                default_categories=u.categories,
                default_max_distance_km=u.max_distance_km,
            )
        except Exception as exc:
            logger.warning("upsert_user(%s) failed (non-fatal): %s", u.user_id, exc)

    try:
        return log_recommendation_request(
            user_ids=[u.user_id for u in request.users],
            merged_budget=merged_budget,
            categories=all_categories,
            top_venue_names=[v["name"] for v in outcome.final],
            merged_max_distance_km=merged_max_distance,
            group_size=len(request.users),
            top_venues_payload=outcome.final,
            request_context={"users": [u.model_dump() for u in request.users]},
            model_version=effective_model_version,
            candidate_set=candidates,
            llm_picks=outcome.llm_picks_payload,
            llm_latency_ms=outcome.llm_latency_ms,
            llm_cost_usd=outcome.llm_cost_usd,
        )
    except Exception as exc:
        logger.warning("DB log failed (non-fatal): %s", exc)
        return None


def _merge_llm_picks(
    picks: list[llm_rerank.LLMRerankResult],
    candidates: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Merge LLM picks (in LLM-rank order) with their matching v0 candidate dicts.

    For each pick, look up the candidate by exact name match, overwrite the
    'reason' field with the LLM's reason, and return the resulting list.

    - Preserves all v0 fields (score, rating, distance_km, google_maps_uri,
      editorial_summary, etc.) so VenueResult(**v) continues to work downstream.
    - Preserves the v0 'score' field for analytics; LLM picks are ordered by
      llm_rank, NOT by score.
    - Names with no candidate match are skipped defensively (should not happen —
      rerank_venues already filters hallucinations).
    """
    by_name = {c.get("name"): c for c in candidates}
    merged: list[dict[str, Any]] = []
    for pick in picks:
        candidate = by_name.get(pick.name)
        if candidate is None:
            continue
        merged.append({**candidate, "reason": pick.reason})
    return merged


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
    merged_budget = merged["merged_budget"]
    merged_max_distance = merged["merged_max_distance"]
    all_categories = merged["all_categories"]

    logger.info(
        "Recommend request | group_size=%d | budget=%s | max_dist=%.1f km | categories=%s",
        len(request.users),
        merged_budget,
        merged_max_distance,
        all_categories,
    )

    # 2. Fetch venues from BigQuery
    try:
        venues = fetch_venues_from_bigquery(
            categories=all_categories,
            max_distance_km=merged_max_distance,
        )
    except Exception as exc:
        logger.exception("BigQuery fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"BigQuery error: {exc}") from exc

    if not venues:
        return RecommendResponse(
            rec_id=None,
            merged_budget=merged_budget,
            merged_max_distance_km=merged_max_distance,
            merged_categories=all_categories,
            group_size=len(request.users),
            venues_scored=0,
            recommendations=[],
        )

    # 3-4. Score, rank, take v0 top-N as LLM candidate set
    ranked = _score_and_rank(venues, merged_budget, merged_max_distance, merged["category_weights"])
    candidates = ranked[:TOP_N_FOR_LLM]

    # 5. LLM rerank (with full v0 fallback)
    outcome = _run_llm_rerank(candidates, merged, len(request.users), request.top_k)

    # The model_version stamped on the recommendation_log row reflects what
    # actually ranked the final list — not just what scored the candidates.
    effective_model_version = (
        f"{outcome.llm_model}+{outcome.prompt_version}" if outcome.used_llm else "rules_v1"
    )

    # 6. DB log (best-effort, returns None on any failure)
    rec_id = _log_recommend_best_effort(
        request,
        merged_budget,
        merged_max_distance,
        all_categories,
        candidates,
        outcome,
        effective_model_version,
    )

    return RecommendResponse(
        rec_id=rec_id,
        merged_budget=merged_budget,
        merged_max_distance_km=merged_max_distance,
        merged_categories=all_categories,
        group_size=len(request.users),
        venues_scored=len(venues),
        model_version=effective_model_version,
        recommendations=[VenueResult(**v) for v in outcome.final],
        used_llm=outcome.used_llm,
        llm_model=outcome.llm_model,
        prompt_version=outcome.prompt_version,
        llm_latency_ms=outcome.llm_latency_ms,
    )


@app.post("/feedback")
def feedback(request: FeedbackRequest):
    """
    Log a user's reaction to a recommended venue. This is the primary training
    signal for the future Learning-to-Rank model.

    Example:
    {
      "user_id":   "user_1",
      "rec_id":    42,                  # from /recommend response
      "venue_name":"Dolores Park Cafe",
      "signal":    "yay"                # 'yay' | 'nahh' | 'visited'
    }
    """
    if not DB_AVAILABLE:
        logger.warning("Feedback received but DB not configured — skipping.")
        return {"status": "accepted", "stored": False, "note": "DB not configured"}

    try:
        feedback_id = log_feedback(
            user_id=request.user_id,
            venue_name=request.venue_name,
            signal=request.signal,
            rec_id=request.rec_id,
            context=request.request_context or {},
        )
        return {
            "status": "accepted",
            "stored": True,
            "feedback_id": feedback_id,
            "rec_id": request.rec_id,
            "signal": request.signal,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Failed to log feedback: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc


@app.post("/events", response_model=EventsResponse)
def events(request: EventsRequest):
    """
    Upcoming Ticketmaster events near SF, filtered by category + distance + date.

    Past events are filtered at the SQL boundary so callers never see stale rows.
    Distance is normalized to km in the output (the events table stores miles).

    Example:
      {
        "categories": ["Entertainment", "Arts & Culture"],
        "max_distance_km": 15,
        "days_ahead": 30,
        "max_price": 100,
        "top_k": 10
      }
    """
    try:
        rows = fetch_events_from_bigquery(
            categories=request.categories,
            max_distance_km=request.max_distance_km,
            days_ahead=request.days_ahead,
        )
    except Exception as exc:
        logger.exception("BigQuery event fetch failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"BigQuery error: {exc}") from exc

    if request.max_price is not None:
        rows = [
            r
            for r in rows
            if r.get("price_min") is None or float(r["price_min"]) <= request.max_price
        ]

    rows = rows[: request.top_k]

    return EventsResponse(
        requested_categories=request.categories,
        max_distance_km=request.max_distance_km,
        days_ahead=request.days_ahead,
        events_found=len(rows),
        events=[
            EventResult(
                name=r.get("name") or "Unknown event",
                category=r.get("category") or "Entertainment",
                segment=r.get("segment"),
                genre=r.get("genre"),
                distance_km=round(float(r.get("distance_km") or 0.0), 2),
                start_datetime_utc=r["start_datetime_utc"].isoformat()
                if hasattr(r.get("start_datetime_utc"), "isoformat")
                else str(r.get("start_datetime_utc") or ""),
                venue_name=r.get("venue_name"),
                event_url=r.get("event_url"),
                image_url=r.get("image_url"),
                price_min=r.get("price_min"),
                price_max=r.get("price_max"),
                price_currency=r.get("price_currency"),
            )
            for r in rows
        ],
    )


# ---------------------------------------------------------------------------
# /groups — multi-user shareable-link sessions
# ---------------------------------------------------------------------------


def _require_db() -> None:
    """Group endpoints need Supabase; refuse cleanly if it's not configured."""
    if not DB_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Group features require DATABASE_URL (Supabase) to be set.",
        )


@app.post("/groups")
def groups_create(request: CreateGroupRequest):
    """
    Mint a new group + invite token. The creator is added as the first
    member in the same DB transaction so they immediately appear in the
    /groups/{id} response. The frontend builds the share URL from
    invite_token (e.g. https://plot-ui.../Plot.html?join=<token>).
    """
    _require_db()
    try:
        group = create_group(name=request.name, created_by=request.creator_user_id)
        if request.creator_display_name:
            join_group(
                group_id=str(group["id"]),
                user_id=request.creator_user_id,
                display_name=request.creator_display_name,
            )
        return {
            "id": str(group["id"]),
            "name": group["name"],
            "invite_token": group["invite_token"],
            "created_by": group["created_by"],
            "created_at": group["created_at"].isoformat() if group.get("created_at") else None,
        }
    except Exception as exc:
        logger.exception("create_group failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc


@app.get("/groups/by-token/{token}")
def groups_peek_by_token(token: str):
    """
    Lightweight preview for the 'someone invited you' landing screen.
    Returns name + member_count without leaking other members' user_ids.
    404 if the token is bogus.
    """
    _require_db()
    g = get_group_by_token(token)
    if not g:
        raise HTTPException(status_code=404, detail="No group with that invite token.")
    return {
        "id": str(g["id"]),
        "name": g["name"],
        "invite_token": g["invite_token"],
        "member_count": int(g["member_count"]),
    }


@app.post("/groups/{group_id}/join")
def groups_join(group_id: str, request: JoinGroupRequest):
    """Add a member (or refresh their display_name) to an existing group."""
    _require_db()
    try:
        join_group(group_id=group_id, user_id=request.user_id, display_name=request.display_name)
        return {"status": "joined", "group_id": group_id, "user_id": request.user_id}
    except Exception as exc:
        logger.exception("join_group failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc


@app.post("/groups/{group_id}/prefs")
def groups_set_prefs(group_id: str, request: SetGroupPrefsRequest):
    """Save a member's per-group prefs so the next /recommend can merge them."""
    _require_db()
    try:
        set_member_prefs(
            group_id=group_id,
            user_id=request.user_id,
            prefs={
                "budget": request.budget,
                "categories": list(request.categories),
                "max_distance_km": float(request.max_distance_km),
            },
        )
        return {"status": "ok"}
    except Exception as exc:
        logger.exception("set_member_prefs failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc


@app.get("/groups/{group_id}")
def groups_get(group_id: str):
    """
    Full live state: members + each one's prefs + every yay/nahh on the
    current rec_id + the active rec's venues. The frontend polls this
    every ~4s. The `active_rec` field is the key piece that makes the
    lobby model work — when one member taps "Get our recs", every other
    member's next poll picks up the venues here without re-running the LLM.
    """
    _require_db()
    g = get_group(group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found.")

    active_rec_payload = None
    raw = g.get("active_rec")
    if raw:
        # Stamp model_version etc into a shape that mirrors a /recommend
        # response so the UI can hydrate recState the same way regardless
        # of whether it triggered the rec or polled it in.
        venues = raw.get("top_venues_payload") or []
        # Some old logs may have come back as a JSON string; coerce.
        if isinstance(venues, str):
            try:
                venues = json.loads(venues)
            except (TypeError, ValueError):
                venues = []
        model_version = (raw.get("model_version") or "rules_v1").strip()
        used_llm = "+" in model_version  # convention: "<llm_model>+<prompt>"
        llm_model = model_version.split("+", 1)[0] if used_llm else None
        active_rec_payload = {
            "rec_id": int(raw["id"]),
            "model_version": model_version,
            "used_llm": used_llm,
            "llm_model": llm_model,
            "llm_latency_ms": raw.get("llm_latency_ms"),
            "recommendations": venues,
        }

    return {
        "id": str(g["id"]),
        "name": g["name"],
        "invite_token": g["invite_token"],
        "created_by": g["created_by"],
        "last_rec_id": g["last_rec_id"],
        "members": [
            {
                "user_id": m["user_id"],
                "display_name": m["display_name"],
                "prefs": m.get("prefs"),
                "joined_at": m["joined_at"].isoformat() if m.get("joined_at") else None,
            }
            for m in g["members"]
        ],
        "votes": [
            {
                "user_id": v["user_id"],
                "venue_name": v["venue_name"],
                "signal": v["signal"],
                "inserted_at": v["inserted_at"].isoformat() if v.get("inserted_at") else None,
            }
            for v in g["votes"]
        ],
        "active_rec": active_rec_payload,
    }


@app.post("/groups/{group_id}/recommend", response_model=RecommendResponse)
def groups_recommend(group_id: str, request: GroupRecommendRequest):
    """
    Group-aware recommendation. We pull all members' prefs from
    group_members, build a synthetic RecommendRequest with a UserPreference
    per member who has set their prefs, and run the existing /recommend
    pipeline. Members who haven't set prefs yet are skipped (they'll join
    the merged set once they do).
    """
    _require_db()
    g = get_group(group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found.")

    user_prefs: list[UserPreference] = []
    for m in g["members"]:
        prefs = m.get("prefs") or {}
        if not prefs.get("categories"):
            continue
        try:
            user_prefs.append(
                UserPreference(
                    user_id=m["user_id"],
                    budget=str(prefs.get("budget") or "medium"),
                    categories=list(prefs["categories"]),
                    max_distance_km=float(prefs.get("max_distance_km") or 5.0),
                )
            )
        except Exception as exc:  # bad prefs row — skip, don't fail the group
            logger.warning("Skipping member %s with malformed prefs: %s", m["user_id"], exc)

    if not user_prefs:
        raise HTTPException(
            status_code=400,
            detail="No member has set their preferences yet. At least one member must "
            "set prefs before the group can get recommendations.",
        )

    response = recommend(RecommendRequest(users=user_prefs, top_k=request.top_k))

    # Stamp the rec_id on the group so all members' phones know which rec
    # to vote on (the next /groups/{id} poll picks it up).
    if response.rec_id is not None:
        try:
            update_group_last_rec(group_id, response.rec_id)
        except Exception as exc:
            logger.warning("update_group_last_rec failed (non-fatal): %s", exc)

    return response


@app.post("/groups/{group_id}/vote")
def groups_vote(group_id: str, request: GroupVoteRequest):
    """Record a yay/nahh from one member on the group's current rec_id."""
    _require_db()
    if request.signal not in {"yay", "nahh"}:
        raise HTTPException(status_code=400, detail="signal must be 'yay' or 'nahh'.")

    g = get_group(group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found.")
    if g["last_rec_id"] is None:
        raise HTTPException(
            status_code=400,
            detail="No active rec to vote on — call /groups/{id}/recommend first.",
        )

    try:
        vote_id = record_group_vote(
            group_id=group_id,
            rec_id=g["last_rec_id"],
            user_id=request.user_id,
            venue_name=request.venue_name,
            signal=request.signal,
        )
        return {"status": "ok", "vote_id": vote_id, "rec_id": g["last_rec_id"]}
    except Exception as exc:
        logger.exception("record_group_vote failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc


@app.get("/users/{user_id}/profile")
def users_profile_get(user_id: str):
    """
    Fetch a user's profile (name, pronouns, date_of_birth, etc).
    Returns a sparse object — fields the user hasn't filled in are null.
    Used by the Onboarding flow to detect "first launch" (200 with all-null
    profile fields) vs "returning" (200 with at least name set).
    """
    _require_db()
    u = get_user(user_id)
    if not u:
        # Treat unknown user as empty profile — onboarding will prompt
        # and a subsequent PUT creates the row.
        return {
            "user_id": user_id,
            "name": None, "pronouns": None, "date_of_birth": None,
        }
    return {
        "user_id": u["user_id"],
        "name": u.get("name"),
        "pronouns": u.get("pronouns"),
        "date_of_birth": u["date_of_birth"].isoformat() if u.get("date_of_birth") else None,
        "default_budget": u.get("default_budget"),
        "default_categories": u.get("default_categories") or [],
        "default_max_distance_km": u.get("default_max_distance_km"),
    }


@app.put("/users/{user_id}/profile")
def users_profile_put(user_id: str, request: UserProfileRequest):
    """
    Onboarding / profile-edit save. Upserts name + pronouns + DOB on the
    users row. Doesn't touch the user's default prefs (those get set when
    they first hit /recommend, via upsert_user).
    """
    _require_db()
    try:
        row = save_user_profile(
            user_id=user_id,
            name=request.name,
            pronouns=request.pronouns,
            date_of_birth=request.date_of_birth,
        )
        return {
            "user_id": row.get("user_id", user_id),
            "name": row.get("name"),
            "pronouns": row.get("pronouns"),
            "date_of_birth": row["date_of_birth"].isoformat()
                if row.get("date_of_birth") else None,
        }
    except Exception as exc:
        logger.exception("save_user_profile failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"DB write failed: {exc}") from exc


@app.get("/users/{user_id}/groups")
def users_groups(user_id: str):
    """List groups this user belongs to, newest first. Used by HomeScreen."""
    _require_db()
    rows = list_user_groups(user_id)
    return {
        "user_id": user_id,
        "groups": [
            {
                "id": str(r["id"]),
                "name": r["name"],
                "invite_token": r["invite_token"],
                "last_rec_id": r["last_rec_id"],
                "member_count": int(r["member_count"]),
                "created_at": r["created_at"].isoformat() if r.get("created_at") else None,
            }
            for r in rows
        ],
    }


@app.post("/parse", response_model=ParseIntentResponse)
def parse(request: ParseIntentRequest):
    """
    Free-text → structured prefs that /recommend already accepts.

    Example:
      { "free_text": "chill cocktail night, no clubs" }
      → {"budget":"medium","max_distance_km":5.0,"categories":["Food & Drink","Nightlife"], ...}

    Falls back to safe defaults if OPENAI_API_KEY is unset or the call fails,
    so the demo never blocks. The frontend uses the result to pre-fill the
    per-user chips/sliders; the user can still tweak before hitting /recommend.
    """
    if not llm_intent.OPENAI_AVAILABLE:
        d = llm_intent.DEFAULT_INTENT
        return ParseIntentResponse(
            budget=d["budget"],
            max_distance_km=d["max_distance_km"],
            categories=list(d["categories"]),
            used_llm=False,
        )

    try:
        intent, meta = llm_intent.parse_intent(request.free_text)
    except llm_intent.LLMIntentError as exc:
        logger.warning("Intent parse failed, returning defaults: %s", exc)
        d = llm_intent.DEFAULT_INTENT
        return ParseIntentResponse(
            budget=d["budget"],
            max_distance_km=d["max_distance_km"],
            categories=list(d["categories"]),
            used_llm=False,
        )

    return ParseIntentResponse(
        budget=intent.budget,
        max_distance_km=intent.max_distance_km,
        categories=intent.categories,
        used_llm=True,
        llm_model=meta.model,
        prompt_version=meta.prompt_version,
        llm_latency_ms=meta.latency_ms,
        llm_cost_usd=meta.cost_usd,
    )
