"""
Mirror Supabase tables into BigQuery for analytics + backup.

Why this exists:
  - Supabase free tier already does daily PITR backups, so this is not the
    primary disaster-recovery story. This script gives us a queryable BQ
    copy so the same SQL workflow that hits places_raw.venues / events also
    hits user feedback + recommendation_log without re-querying Supabase.
  - Works as belt-and-suspenders against accidental table drops on Supabase.

Strategy:
  Full refresh (WRITE_TRUNCATE) for every table, every Monday. Tables are
  small (low five-figure rows max for a class project) so the cost of
  reloading the whole table is trivial vs the operational complexity of
  CDC / incremental sync.

JSONB columns (top_venues_payload, candidate_set, llm_picks, request_context,
context, prefs) are serialized to JSON strings so BigQuery autodetect picks
STRING. UUIDs are stringified for the same reason.

Required env vars:
  DATABASE_URL  — Supabase pooler connection string
  GCP_PROJECT   — target BigQuery project (defaults to mlops-project-491402)

Optional:
  BQ_BACKUP_DATASET  — dataset name (default: plot_supabase_mirror)
  BQ_BACKUP_LOCATION — dataset location (default: US)
"""

from __future__ import annotations

import json
import logging
import os
import sys
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg2
from google.cloud import bigquery
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("supabase_to_bq")

# Try to load .env locally so the script runs without manual `source .env`.
# In CI the env vars come from GitHub Actions secrets directly.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

PROJECT = os.environ.get("GCP_PROJECT", "mlops-project-491402")
DATASET = os.environ.get("BQ_BACKUP_DATASET", "plot_supabase_mirror")
LOCATION = os.environ.get("BQ_BACKUP_LOCATION", "US")
DATABASE_URL = os.environ.get("DATABASE_URL")

# Tables to mirror, in dependency order (parents before children for clarity —
# WRITE_TRUNCATE doesn't enforce FKs, but readability matters).
TABLES = [
    "users",
    "recommendation_log",
    "feedback",
    "groups",
    "group_members",
    "group_votes",
]


def _serialize_cell(value: Any) -> Any:
    """
    Coerce psycopg2-returned types into BigQuery-friendly primitives.
    `load_table_from_json` does its own JSON encoding internally and chokes
    on datetime/UUID/Decimal/dict, so everything non-primitive becomes a
    string up-front. Datetimes become ISO strings (BQ autodetect parses
    them as TIMESTAMP).
    """
    if value is None:
        return None
    if isinstance(value, bool):  # bool is subclass of int — check first
        return value
    if isinstance(value, (str, int, float)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


def _fetch_rows(conn, table: str) -> list[dict[str, Any]]:
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(f"SELECT * FROM {table};")  # noqa: S608 — table list is hardcoded
        rows = cur.fetchall()
    return [dict(r) for r in rows]


def _ensure_dataset(bq: bigquery.Client) -> None:
    dataset_id = f"{PROJECT}.{DATASET}"
    try:
        bq.get_dataset(dataset_id)
        log.info("Dataset %s exists.", dataset_id)
    except Exception:
        ds = bigquery.Dataset(dataset_id)
        ds.location = LOCATION
        ds.description = "Weekly mirror of Supabase tables for analytics + backup."
        bq.create_dataset(ds, exists_ok=True)
        log.info("Created dataset %s in %s.", dataset_id, LOCATION)


def _load_table(bq: bigquery.Client, table: str, rows: list[dict[str, Any]]) -> int:
    """Write rows to BigQuery. Returns number of rows loaded."""
    table_id = f"{PROJECT}.{DATASET}.{table}"

    if not rows:
        # Still recreate the table empty so downstream queries don't break,
        # but skip the load. Use a no-op truncate via load with empty list.
        log.info("%s: 0 rows in Supabase — leaving BQ table as-is.", table)
        return 0

    cleaned = [{k: _serialize_cell(v) for k, v in r.items()} for r in rows]

    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
        autodetect=True,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    job = bq.load_table_from_json(cleaned, table_id, job_config=job_config)
    job.result()  # wait
    return len(cleaned)


def main() -> int:
    if not DATABASE_URL:
        log.error("DATABASE_URL is not set. Cannot read from Supabase.")
        return 2

    log.info("Project=%s Dataset=%s Location=%s", PROJECT, DATASET, LOCATION)
    bq = bigquery.Client(project=PROJECT)
    _ensure_dataset(bq)

    total = 0
    with psycopg2.connect(DATABASE_URL) as conn:
        for table in TABLES:
            rows = _fetch_rows(conn, table)
            n = _load_table(bq, table, rows)
            total += n
            log.info("%s: %d rows mirrored", table, n)

    log.info("Done. %d rows mirrored across %d tables.", total, len(TABLES))
    return 0


if __name__ == "__main__":
    sys.exit(main())
