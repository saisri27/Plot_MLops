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
    id              SERIAL PRIMARY KEY,
    user_ids        TEXT[],                        -- all users in the group
    merged_budget   TEXT,
    categories      TEXT[],
    top_venues      TEXT[],                        -- names of venues returned
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Log user feedback on individual venues (the ML training signal)
CREATE TABLE IF NOT EXISTS feedback (
    id              SERIAL PRIMARY KEY,
    user_id         TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    venue_name      TEXT NOT NULL,
    accepted        BOOLEAN NOT NULL,             -- True = liked, False = rejected
    context         JSONB DEFAULT '{}',           -- optional: budget/category context
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast feedback lookups by user
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_venue   ON feedback(venue_name);
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
) -> None:
    """Log every /recommend call. Used for analytics and future feature engineering."""
    sql = """
        INSERT INTO recommendation_log (user_ids, merged_budget, categories, top_venues)
        VALUES (%s, %s, %s, %s);
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (user_ids, merged_budget, categories, top_venue_names))
        conn.commit()


# ---------------------------------------------------------------------------
# Feedback logging (the ML training signal)
# ---------------------------------------------------------------------------

def log_feedback(
    user_id: str,
    venue_name: str,
    accepted: bool,
    context: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Record whether a user accepted or rejected a recommended venue.
    This is the core training signal for improving the ranker over time.
    """
    sql = """
        INSERT INTO feedback (user_id, venue_name, accepted, context)
        VALUES (%s, %s, %s, %s);
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (
                user_id,
                venue_name,
                accepted,
                json.dumps(context or {}),
            ))
        conn.commit()


def get_feedback_for_training() -> List[Dict[str, Any]]:
    """
    Fetch all feedback rows for use in ML training.
    Returns list of dicts: {user_id, venue_name, accepted, context, created_at}
    Use this in your training pipeline to build the (venue, user_prefs) → accepted label.
    """
    sql = """
        SELECT user_id, venue_name, accepted, context, created_at
        FROM feedback
        ORDER BY created_at DESC;
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
