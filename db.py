"""
db.py — Supabase (Postgres) connection + schema for Plot user data
==================================================================

FREE SETUP (takes 2 minutes):
  1. Go to https://supabase.com → sign up free → New project → name it "plot"
  2. Wait ~1 min for the project to spin up
  3. Go to: Project Settings → Database → Connection string → select "Session pooler"
       Looks like: postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
  4. Copy it and set as an environment variable:
       export DATABASE_URL="postgresql://postgres.xxxx:password@aws-0-us-east-1.pooler.supabase.com:5432/postgres"
  5. Run this file once to create the tables:
       python db.py

  TIP: You can also see and edit your tables visually in the Supabase dashboard
       under Table Editor — great for debugging.

Tables created:
  users              — user profiles and preferences
  recommendation_log — every /recommend request (for analytics)
  feedback           — accepted/rejected venues (feeds ML retraining)

install: pip install psycopg2-binary python-dotenv
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

load_dotenv()  # loads .env from project root automatically

logger = logging.getLogger(__name__)

# Read from environment — set this to your Supabase Session Pooler connection string
DATABASE_URL: str = os.environ.get("DATABASE_URL", "")


def _get_conn():
    """
    Open a Postgres connection to Supabase.
    Supabase's connection string already includes sslmode=require,
    so we pass it directly without overrides.
    """
    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL is not set.\n"
            "Get it from: Supabase dashboard → Project Settings → Database → "
            "Connection string → Session pooler"
        )
    return psycopg2.connect(DATABASE_URL)


# ---------------------------------------------------------------------------
# Schema setup — run once
# ---------------------------------------------------------------------------

CREATE_TABLES_SQL = """
-- Users and their stored preferences
CREATE TABLE IF NOT EXISTS users (
    user_id         TEXT PRIMARY KEY,
    name            TEXT,
    email           TEXT UNIQUE,
    default_budget  TEXT DEFAULT 'medium',        -- low / medium / high
    default_categories TEXT[] DEFAULT '{}',       -- e.g. {Food & Drink, Outdoors}
    default_max_distance_km FLOAT DEFAULT 5.0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Log every /recommend call (for analytics and retraining feature engineering)
CREATE TABLE IF NOT EXISTS recommendation_log (
    id              SERIAL PRIMARY KEY,            -- this is the rec_id used in feedback
    user_ids        TEXT[],                        -- all users in the group
    merged_budget   TEXT,
    merged_max_distance_km FLOAT,
    group_size      INTEGER,
    categories      TEXT[],
    top_venues      TEXT[],                        -- names of venues returned
    top_venues_payload JSONB DEFAULT '[]',         -- full venue objects with score/features at time of rec
    request_context JSONB DEFAULT '{}',            -- raw request payload (per-user prefs)
    model_version   TEXT DEFAULT 'rules_v1',       -- which scorer produced this
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Migrations for recommendation_log when columns were added later (idempotent)
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS merged_max_distance_km FLOAT;
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS group_size INTEGER;
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS top_venues_payload JSONB DEFAULT '[]';
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS request_context JSONB DEFAULT '{}';
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS model_version TEXT DEFAULT 'rules_v1';

-- Log user feedback on individual venues (the ML training signal)
CREATE TABLE IF NOT EXISTS feedback (
    id              SERIAL PRIMARY KEY,
    rec_id          INTEGER,                       -- FK → recommendation_log.id (the request that surfaced this venue)
    user_id         TEXT,
    venue_name      TEXT NOT NULL,
    signal          TEXT NOT NULL DEFAULT 'yay',   -- 'yay' | 'nahh' | 'visited'
    accepted        BOOLEAN NOT NULL,              -- yay/visited = true, nahh = false
    context         JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Migrations for feedback when columns were added later (idempotent)
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS rec_id INTEGER;
ALTER TABLE feedback ADD COLUMN IF NOT EXISTS signal TEXT DEFAULT 'yay';

-- Drop the old FK on feedback.user_id so we can log feedback for demo / mock /
-- group-pseudo user_ids that don't exist in `users`. We can re-add a soft FK
-- later once we have a real auth flow.
ALTER TABLE feedback DROP CONSTRAINT IF EXISTS feedback_user_id_fkey;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_venue   ON feedback(venue_name);
CREATE INDEX IF NOT EXISTS idx_feedback_rec_id  ON feedback(rec_id);
"""


def create_tables() -> None:
    """Create all tables if they don't exist. Run once on first deploy."""
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_TABLES_SQL)
        conn.commit()
    logger.info("Tables created (or already exist).")


# ---------------------------------------------------------------------------
# User operations
# ---------------------------------------------------------------------------

def upsert_user(
    user_id: str,
    name: Optional[str] = None,
    email: Optional[str] = None,
    default_budget: str = "medium",
    default_categories: Optional[List[str]] = None,
    default_max_distance_km: float = 5.0,
) -> None:
    """Insert or update a user's profile and preferences."""
    sql = """
        INSERT INTO users (user_id, name, email, default_budget, default_categories, default_max_distance_km, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            name                    = EXCLUDED.name,
            email                   = EXCLUDED.email,
            default_budget          = EXCLUDED.default_budget,
            default_categories      = EXCLUDED.default_categories,
            default_max_distance_km = EXCLUDED.default_max_distance_km,
            updated_at              = NOW();
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                user_id,
                name,
                email,
                default_budget,
                default_categories or [],
                default_max_distance_km,
            ))
        conn.commit()


def get_user(user_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a user's preferences by user_id. Returns None if not found."""
    sql = "SELECT * FROM users WHERE user_id = %s LIMIT 1;"
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql, (user_id,))
            row = cur.fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Recommendation logging
# ---------------------------------------------------------------------------

def log_recommendation_request(
    user_ids: List[str],
    merged_budget: str,
    categories: List[str],
    top_venue_names: List[str],
    merged_max_distance_km: Optional[float] = None,
    group_size: Optional[int] = None,
    top_venues_payload: Optional[List[Dict[str, Any]]] = None,
    request_context: Optional[Dict[str, Any]] = None,
    model_version: str = "rules_v1",
) -> int:
    """
    Log every /recommend call. Used for analytics and future feature engineering.
    Returns the new rec_id (recommendation_log.id) so the caller can echo it back
    to the client and link feedback rows to this exact recommendation.
    """
    sql = """
        INSERT INTO recommendation_log
            (user_ids, merged_budget, merged_max_distance_km, group_size,
             categories, top_venues, top_venues_payload, request_context, model_version)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                user_ids,
                merged_budget,
                merged_max_distance_km,
                group_size,
                categories,
                top_venue_names,
                json.dumps(top_venues_payload or []),
                json.dumps(request_context or {}),
                model_version,
            ))
            rec_id = cur.fetchone()[0]
        conn.commit()
    return int(rec_id)


# ---------------------------------------------------------------------------
# Feedback logging (the ML training signal)
# ---------------------------------------------------------------------------

def log_feedback(
    user_id: str,
    venue_name: str,
    signal: str = "yay",
    rec_id: Optional[int] = None,
    context: Optional[Dict[str, Any]] = None,
) -> int:
    """
    Record whether a user said yay/nahh/visited on a recommended venue.

    Args:
        user_id    : id of the user (or "group:..." for group-level feedback)
        venue_name : the venue the feedback is about
        signal     : 'yay' (liked), 'nahh' (rejected), or 'visited' (actually went)
        rec_id     : id of the recommendation_log row this feedback links to
        context    : optional extra info (e.g. {"score_at_rec": 0.83})

    Returns the new feedback row id.
    """
    signal = (signal or "yay").lower()
    if signal not in {"yay", "nahh", "visited"}:
        raise ValueError(f"Invalid signal '{signal}'. Use yay / nahh / visited.")
    accepted = signal in {"yay", "visited"}

    sql = """
        INSERT INTO feedback (rec_id, user_id, venue_name, signal, accepted, context)
        VALUES (%s, %s, %s, %s, %s, %s)
        RETURNING id;
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                rec_id,
                user_id,
                venue_name,
                signal,
                accepted,
                json.dumps(context or {}),
            ))
            fid = cur.fetchone()[0]
        conn.commit()
    return int(fid)


def get_feedback_for_training() -> List[Dict[str, Any]]:
    """
    Fetch all feedback rows for use in ML training.
    Returns list of dicts: {rec_id, user_id, venue_name, signal, accepted, context, created_at}
    """
    sql = """
        SELECT rec_id, user_id, venue_name, signal, accepted, context, created_at
        FROM feedback
        ORDER BY created_at DESC;
    """
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    return [dict(r) for r in rows]


def get_training_join() -> List[Dict[str, Any]]:
    """
    Build the canonical (request_features, venue_features) -> label training rows
    by joining recommendation_log with feedback on rec_id.

    Each returned row is one (rec_id, venue_name, signal) sample with everything
    the model needs about the request that produced it. The training script
    (build_training_data.py) explodes top_venues_payload into per-venue features.
    """
    sql = """
        SELECT
            r.id                AS rec_id,
            r.created_at        AS rec_created_at,
            r.user_ids,
            r.group_size,
            r.merged_budget,
            r.merged_max_distance_km,
            r.categories        AS merged_categories,
            r.top_venues_payload,
            r.request_context,
            r.model_version,
            f.id                AS feedback_id,
            f.user_id           AS feedback_user_id,
            f.venue_name        AS feedback_venue_name,
            f.signal            AS feedback_signal,
            f.accepted          AS feedback_accepted,
            f.context           AS feedback_context,
            f.created_at        AS feedback_created_at
        FROM recommendation_log r
        LEFT JOIN feedback f ON f.rec_id = r.id
        ORDER BY r.created_at DESC;
    """
    with _get_conn() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(sql)
            rows = cur.fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Run once to create tables
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("Connecting to Supabase and creating tables...")
    create_tables()
    print("Done. Your database is ready.")
    print("\nYou can now see your tables in the Supabase dashboard → Table Editor.")
    print("Next: add DATABASE_URL to your Cloud Run environment variables.")
