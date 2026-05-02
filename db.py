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
import secrets
from typing import Any

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor

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
-- The full v0-scored candidate set sent to the LLM (~20 venues). Lets the
-- ranker train on shown-but-not-picked negatives instead of just the one
-- venue that got Yay/Nahh. Also lets eval pipelines replay prompts later.
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS candidate_set JSONB DEFAULT '[]';
-- The LLM's picks with reasons, separate from top_venues_payload so we can
-- compare LLM ordering against feedback even if model_version doesn't say "llm".
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS llm_picks JSONB DEFAULT '[]';
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS llm_latency_ms INTEGER;
ALTER TABLE recommendation_log ADD COLUMN IF NOT EXISTS llm_cost_usd FLOAT;

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

-- ============================================================
-- Groups: shareable-link multi-user planning sessions.
-- A creator mints a group + invite_token, sends the URL to friends.
-- Friends open the URL, type a display name, and join. Identity is
-- per-device (random user_id from localStorage) until real Supabase
-- Auth lands; the schema doesn't care which kind of user_id it is.
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    invite_token    TEXT UNIQUE NOT NULL,        -- short URL-safe token
    created_by      TEXT NOT NULL,               -- creator's user_id
    last_rec_id     INTEGER,                     -- the rec_id everyone is voting on
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_groups_invite_token ON groups(invite_token);
CREATE INDEX IF NOT EXISTS idx_groups_created_by   ON groups(created_by);

-- One row per (group, member). Composite primary key prevents the same
-- person joining twice. `prefs` stores the member's per-group prefs as
-- JSON (budget, categories, max_distance_km) so we can merge across
-- members at recommend time.
CREATE TABLE IF NOT EXISTS group_members (
    group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL,
    display_name    TEXT NOT NULL,
    prefs           JSONB DEFAULT NULL,          -- {budget, categories, max_distance_km}
    joined_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);

-- One row per (group, rec_id, member, venue) yay/nahh. Lets every member's
-- phone show the live tally as votes come in (frontend polls /groups/{id}).
-- We don't dedupe in-place — the latest vote wins via inserted_at.
CREATE TABLE IF NOT EXISTS group_votes (
    id              SERIAL PRIMARY KEY,
    group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    rec_id          INTEGER NOT NULL,
    user_id         TEXT NOT NULL,
    venue_name      TEXT NOT NULL,
    signal          TEXT NOT NULL,               -- 'yay' | 'nahh'
    inserted_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_group_votes_group_rec ON group_votes(group_id, rec_id);
CREATE INDEX IF NOT EXISTS idx_group_votes_member    ON group_votes(group_id, user_id);

-- pgcrypto enables gen_random_uuid() above. Idempotent — no-op if already enabled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
    name: str | None = None,
    email: str | None = None,
    default_budget: str = "medium",
    default_categories: list[str] | None = None,
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
            cur.execute(
                sql,
                (
                    user_id,
                    name,
                    email,
                    default_budget,
                    default_categories or [],
                    default_max_distance_km,
                ),
            )
        conn.commit()


def get_user(user_id: str) -> dict[str, Any] | None:
    """Fetch a user's preferences by user_id. Returns None if not found."""
    sql = "SELECT * FROM users WHERE user_id = %s LIMIT 1;"
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, (user_id,))
        row = cur.fetchone()
    return dict(row) if row else None


# ---------------------------------------------------------------------------
# Recommendation logging
# ---------------------------------------------------------------------------


def log_recommendation_request(
    user_ids: list[str],
    merged_budget: str,
    categories: list[str],
    top_venue_names: list[str],
    merged_max_distance_km: float | None = None,
    group_size: int | None = None,
    top_venues_payload: list[dict[str, Any]] | None = None,
    request_context: dict[str, Any] | None = None,
    model_version: str = "rules_v1",
    candidate_set: list[dict[str, Any]] | None = None,
    llm_picks: list[dict[str, Any]] | None = None,
    llm_latency_ms: int | None = None,
    llm_cost_usd: float | None = None,
) -> int:
    """
    Log every /recommend call. Used for analytics and future feature engineering.
    Returns the new rec_id (recommendation_log.id) so the caller can echo it back
    to the client and link feedback rows to this exact recommendation.

    candidate_set:  the full v0-scored candidates fed to the LLM (~20 venues).
                    The ranker trains on these so it sees shown-but-not-picked
                    negatives, not just the one venue that got Yay/Nahh.
    llm_picks:      the LLM's picks with reasons. Lets eval pipelines compare
                    LLM order to feedback even when fallback to v0 happens.
    """
    sql = """
        INSERT INTO recommendation_log
            (user_ids, merged_budget, merged_max_distance_km, group_size,
             categories, top_venues, top_venues_payload, request_context,
             model_version, candidate_set, llm_picks, llm_latency_ms, llm_cost_usd)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id;
    """
    with _get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                sql,
                (
                    user_ids,
                    merged_budget,
                    merged_max_distance_km,
                    group_size,
                    categories,
                    top_venue_names,
                    json.dumps(top_venues_payload or []),
                    json.dumps(request_context or {}),
                    model_version,
                    json.dumps(candidate_set or []),
                    json.dumps(llm_picks or []),
                    llm_latency_ms,
                    llm_cost_usd,
                ),
            )
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
    rec_id: int | None = None,
    context: dict[str, Any] | None = None,
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
            cur.execute(
                sql,
                (
                    rec_id,
                    user_id,
                    venue_name,
                    signal,
                    accepted,
                    json.dumps(context or {}),
                ),
            )
            fid = cur.fetchone()[0]
        conn.commit()
    return int(fid)


def get_feedback_for_training() -> list[dict[str, Any]]:
    """
    Fetch all feedback rows for use in ML training.
    Returns list of dicts: {rec_id, user_id, venue_name, signal, accepted, context, created_at}
    """
    sql = """
        SELECT rec_id, user_id, venue_name, signal, accepted, context, created_at
        FROM feedback
        ORDER BY created_at DESC;
    """
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def get_training_join() -> list[dict[str, Any]]:
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
            r.candidate_set,
            r.llm_picks,
            r.llm_latency_ms,
            r.llm_cost_usd,
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
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql)
        rows = cur.fetchall()
    return [dict(r) for r in rows]


# ---------------------------------------------------------------------------
# Groups: shareable-link multi-user sessions
# ---------------------------------------------------------------------------


def _new_invite_token() -> str:
    """Short URL-safe random string. ~6 bytes -> 8 base64url chars."""
    return secrets.token_urlsafe(6)


def create_group(name: str, created_by: str) -> dict[str, Any]:
    """
    Mint a new group + invite token. The creator is added as the first member
    in the same transaction so they immediately show up in /groups/{id}.
    Returns {id, name, invite_token, created_by, created_at}.
    """
    token = _new_invite_token()
    sql_insert = """
        INSERT INTO groups (name, invite_token, created_by)
        VALUES (%s, %s, %s)
        RETURNING id, name, invite_token, created_by, created_at;
    """
    sql_member = """
        INSERT INTO group_members (group_id, user_id, display_name)
        VALUES (%s, %s, %s)
        ON CONFLICT (group_id, user_id) DO NOTHING;
    """
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql_insert, (name, token, created_by))
        row = cur.fetchone()
        # Use the creator's user_id as their first display_name placeholder;
        # they'll typically rename via the home/profile screen.
        cur.execute(sql_member, (row["id"], created_by, "Host"))
        conn.commit()
    return dict(row)


def get_group_by_token(token: str) -> dict[str, Any] | None:
    """
    Return a lightweight group preview (no member prefs) for the
    'someone invited you' landing screen. None if the token is unknown.
    """
    sql = """
        SELECT g.id, g.name, g.invite_token, g.created_by, g.created_at,
               COUNT(gm.user_id) AS member_count
        FROM groups g
        LEFT JOIN group_members gm ON gm.group_id = g.id
        WHERE g.invite_token = %s
        GROUP BY g.id;
    """
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, (token,))
        row = cur.fetchone()
    return dict(row) if row else None


def join_group(group_id: str, user_id: str, display_name: str) -> None:
    """
    Add (or refresh) a member of an existing group. ON CONFLICT updates the
    display_name so a returning user can change how they appear without
    creating a duplicate row.
    """
    sql = """
        INSERT INTO group_members (group_id, user_id, display_name)
        VALUES (%s, %s, %s)
        ON CONFLICT (group_id, user_id) DO UPDATE
            SET display_name = EXCLUDED.display_name;
    """
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (group_id, user_id, display_name))
        conn.commit()


def set_member_prefs(group_id: str, user_id: str, prefs: dict[str, Any]) -> None:
    """Update a member's per-group preferences (budget, categories, distance)."""
    sql = """
        UPDATE group_members
        SET prefs = %s::jsonb
        WHERE group_id = %s AND user_id = %s;
    """
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (json.dumps(prefs), group_id, user_id))
        conn.commit()


def get_group(group_id: str) -> dict[str, Any] | None:
    """
    Full group state for the live planning UI: members + each one's prefs +
    every yay/nahh on the current rec_id + the actual rec venues if a rec
    has been triggered. Polled every ~4 s by clients so the moment any one
    member taps "Get our recs", every other phone hydrates from the same
    rec without re-running the LLM.
    """
    sql_group = (
        "SELECT id, name, invite_token, created_by, last_rec_id, created_at "
        "FROM groups WHERE id = %s;"
    )
    sql_members = """
        SELECT user_id, display_name, prefs, joined_at
        FROM group_members
        WHERE group_id = %s
        ORDER BY joined_at ASC;
    """
    sql_votes = """
        SELECT user_id, venue_name, signal, inserted_at
        FROM group_votes
        WHERE group_id = %s AND rec_id = %s
        ORDER BY inserted_at DESC;
    """
    sql_active_rec = """
        SELECT id, top_venues_payload, model_version, llm_latency_ms, llm_cost_usd
        FROM recommendation_log
        WHERE id = %s;
    """
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql_group, (group_id,))
        group = cur.fetchone()
        if not group:
            return None
        group = dict(group)
        cur.execute(sql_members, (group_id,))
        members = [dict(r) for r in cur.fetchall()]
        votes = []
        active_rec = None
        if group["last_rec_id"] is not None:
            cur.execute(sql_votes, (group_id, group["last_rec_id"]))
            votes = [dict(r) for r in cur.fetchall()]
            cur.execute(sql_active_rec, (group["last_rec_id"],))
            row = cur.fetchone()
            if row:
                active_rec = dict(row)
    group["members"] = members
    group["votes"] = votes
    group["active_rec"] = active_rec
    return group


def update_group_last_rec(group_id: str, rec_id: int) -> None:
    """Stamp the rec_id everyone is currently voting on."""
    sql = "UPDATE groups SET last_rec_id = %s WHERE id = %s;"
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (rec_id, group_id))
        conn.commit()


def record_group_vote(
    group_id: str,
    rec_id: int,
    user_id: str,
    venue_name: str,
    signal: str,
) -> int:
    """
    Append a vote. We don't dedupe per (member, venue) here — the latest
    inserted_at wins on the read side. That keeps writes cheap and lets us
    reconstruct the full voting history later if we want.
    """
    sql = """
        INSERT INTO group_votes (group_id, rec_id, user_id, venue_name, signal)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING id;
    """
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (group_id, rec_id, user_id, venue_name, signal))
        vid = cur.fetchone()[0]
        conn.commit()
    return int(vid)


def list_user_groups(user_id: str) -> list[dict[str, Any]]:
    """Groups this user belongs to, newest first. Used by HomeScreen."""
    sql = """
        SELECT g.id, g.name, g.invite_token, g.last_rec_id, g.created_at,
               COUNT(gm2.user_id) AS member_count
        FROM groups g
        JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = %s
        LEFT JOIN group_members gm2 ON gm2.group_id = g.id
        GROUP BY g.id
        ORDER BY g.created_at DESC;
    """
    with _get_conn() as conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, (user_id,))
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
