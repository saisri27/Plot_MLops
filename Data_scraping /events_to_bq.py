"""
Fetch upcoming events from Ticketmaster Discovery API and write to BigQuery.

Paginates through all available events near San Francisco (30-mile radius),
flattens the JSON, and inserts into BigQuery with daily dedup so re-runs
on the same day won't duplicate rows but future runs capture new/changed events.

Usage:
    python events_to_bq.py                    # fetch all upcoming SF events
    python events_to_bq.py "concerts"         # filter by keyword
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any

import requests
from dotenv import load_dotenv
from google.cloud import bigquery

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
TM_API_KEY = os.environ.get("TICKETMASTER_API_KEY", "").strip()
GCP_PROJECT = os.environ.get("GCP_PROJECT", "").strip()
BQ_DATASET = os.environ.get("BQ_DATASET", "places_raw").strip()
BQ_EVENTS_TABLE = os.environ.get("BQ_EVENTS_TABLE", "events").strip()

BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

SF_LAT = 37.7749
SF_LNG = -122.4194
SEARCH_RADIUS = "30"
SEARCH_UNIT = "miles"
PAGE_SIZE = 200  # max allowed by Ticketmaster

# Ticketmaster caps at page * size < 1000, so max ~5 pages of 200
MAX_PAGES = 5

# ---------------------------------------------------------------------------
# BigQuery schema for events
# ---------------------------------------------------------------------------
BQ_EVENTS_SCHEMA = [
    bigquery.SchemaField("event_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("name", "STRING"),
    bigquery.SchemaField("event_url", "STRING"),
    bigquery.SchemaField("image_url", "STRING"),
    bigquery.SchemaField("start_date", "STRING"),
    bigquery.SchemaField("start_time", "STRING"),
    bigquery.SchemaField("start_datetime_utc", "TIMESTAMP"),
    bigquery.SchemaField("end_date", "STRING"),
    bigquery.SchemaField("end_time", "STRING"),
    bigquery.SchemaField("timezone", "STRING"),
    bigquery.SchemaField("status", "STRING"),
    bigquery.SchemaField("segment", "STRING"),
    bigquery.SchemaField("genre", "STRING"),
    bigquery.SchemaField("subgenre", "STRING"),
    bigquery.SchemaField("price_min", "FLOAT"),
    bigquery.SchemaField("price_max", "FLOAT"),
    bigquery.SchemaField("price_currency", "STRING"),
    bigquery.SchemaField("venue_name", "STRING"),
    bigquery.SchemaField("venue_id", "STRING"),
    bigquery.SchemaField("venue_address", "STRING"),
    bigquery.SchemaField("venue_city", "STRING"),
    bigquery.SchemaField("venue_state", "STRING"),
    bigquery.SchemaField("venue_postal_code", "STRING"),
    bigquery.SchemaField("venue_latitude", "FLOAT"),
    bigquery.SchemaField("venue_longitude", "FLOAT"),
    bigquery.SchemaField("distance_miles", "FLOAT"),
    bigquery.SchemaField("keyword", "STRING"),
    bigquery.SchemaField("fetched_at", "TIMESTAMP"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def flatten_event(raw: dict[str, Any], keyword: str, ts: str) -> dict[str, Any]:
    """Turn one Ticketmaster event JSON into a flat dict matching BQ schema."""
    dates = raw.get("dates", {})
    start = dates.get("start", {})
    end = dates.get("end", {})

    classifications = raw.get("classifications", [])
    cls0 = classifications[0] if classifications else {}

    price_ranges = raw.get("priceRanges", [])
    pr0 = price_ranges[0] if price_ranges else {}

    venues = (raw.get("_embedded") or {}).get("venues", [])
    v0 = venues[0] if venues else {}
    v_location = v0.get("location", {})

    images = raw.get("images", [])
    image_url = None
    for img in images:
        if img.get("ratio") == "16_9" and img.get("width", 0) >= 1024:
            image_url = img.get("url")
            break
    if not image_url and images:
        image_url = images[0].get("url")

    v_lat = None
    v_lng = None
    try:
        v_lat = float(v_location.get("latitude"))
        v_lng = float(v_location.get("longitude"))
    except (TypeError, ValueError):
        pass

    start_dt_utc = start.get("dateTime")

    return {
        "event_id": raw.get("id"),
        "name": raw.get("name"),
        "event_url": raw.get("url"),
        "image_url": image_url,
        "start_date": start.get("localDate"),
        "start_time": start.get("localTime"),
        "start_datetime_utc": start_dt_utc,
        "end_date": end.get("localDate"),
        "end_time": end.get("localTime"),
        "timezone": dates.get("timezone"),
        "status": (dates.get("status") or {}).get("code"),
        "segment": (cls0.get("segment") or {}).get("name"),
        "genre": (cls0.get("genre") or {}).get("name"),
        "subgenre": (cls0.get("subGenre") or {}).get("name"),
        "price_min": pr0.get("min"),
        "price_max": pr0.get("max"),
        "price_currency": pr0.get("currency"),
        "venue_name": v0.get("name"),
        "venue_id": v0.get("id"),
        "venue_address": (v0.get("address") or {}).get("line1"),
        "venue_city": (v0.get("city") or {}).get("name"),
        "venue_state": (v0.get("state") or {}).get("stateCode"),
        "venue_postal_code": v0.get("postalCode"),
        "venue_latitude": v_lat,
        "venue_longitude": v_lng,
        "distance_miles": raw.get("distance"),
        "keyword": keyword,
        "fetched_at": ts,
    }


def fetch_all_events(keyword: str = "") -> list[dict[str, Any]]:
    """Paginate through Ticketmaster search results for SF-area events."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    all_events: list[dict[str, Any]] = []

    for page_num in range(MAX_PAGES):
        params: dict[str, Any] = {
            "apikey": TM_API_KEY,
            "latlong": f"{SF_LAT},{SF_LNG}",
            "radius": SEARCH_RADIUS,
            "unit": SEARCH_UNIT,
            "size": PAGE_SIZE,
            "page": page_num,
            "startDateTime": now,
            "sort": "date,asc",
        }
        if keyword:
            params["keyword"] = keyword

        resp = requests.get(BASE_URL, params=params, timeout=30)

        if resp.status_code == 429:
            print("  Rate limited — waiting 60s...", file=sys.stderr)
            time.sleep(60)
            resp = requests.get(BASE_URL, params=params, timeout=30)

        if not resp.ok:
            print(f"  API error {resp.status_code}: {resp.text}", file=sys.stderr)
            break

        data = resp.json()
        embedded = data.get("_embedded", {})
        events = embedded.get("events", [])
        page_info = data.get("page", {})

        all_events.extend(events)
        total = page_info.get("totalElements", 0)
        print(f"  page {page_num}: got {len(events)} events (total available: {total})")

        if (page_num + 1) * PAGE_SIZE >= total:
            break
        if (page_num + 1) * PAGE_SIZE >= 1000:
            print("  Reached Ticketmaster 1000-result cap")
            break

        time.sleep(0.5)

    return all_events


# ---------------------------------------------------------------------------
# BigQuery helpers (same pattern as places_to_bq.py)
# ---------------------------------------------------------------------------

def ensure_events_table(client: bigquery.Client, table_ref: str) -> bigquery.Table:
    """Create dataset + events table if they don't exist yet."""
    dataset_ref = f"{GCP_PROJECT}.{BQ_DATASET}"
    dataset = bigquery.Dataset(dataset_ref)
    dataset.location = "US"
    client.create_dataset(dataset, exists_ok=True)

    try:
        return client.get_table(table_ref)
    except Exception:
        pass

    table = bigquery.Table(table_ref, schema=BQ_EVENTS_SCHEMA)
    table = client.create_table(table)
    print("Created events table — waiting 30s for BigQuery to be ready...")
    time.sleep(30)
    return table


def get_existing_event_keys(client: bigquery.Client, table_ref: str) -> set[str]:
    """Return set of (event_id, date) keys already in the table."""
    try:
        query = (
            f"SELECT DISTINCT event_id, DATE(fetched_at) AS fetch_date "
            f"FROM `{table_ref}`"
        )
        result = client.query(query).result()
        return {f"{row.event_id}_{row.fetch_date}" for row in result}
    except Exception:
        return set()


def load_events_to_bq(rows: list[dict[str, Any]]) -> None:
    """Load event rows into BigQuery, skipping events already scraped today."""
    client = bigquery.Client(project=GCP_PROJECT)
    table_ref = f"{GCP_PROJECT}.{BQ_DATASET}.{BQ_EVENTS_TABLE}"
    ensure_events_table(client, table_ref)

    existing = get_existing_event_keys(client, table_ref)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    new_rows = [r for r in rows if f"{r['event_id']}_{today}" not in existing]
    skipped = len(rows) - len(new_rows)

    if skipped:
        print(f"Skipping {skipped} events already scraped today ({today})")
    if not new_rows:
        print("All events already exist for today — nothing new to insert.")
        return

    errors = client.insert_rows_json(table_ref, new_rows)
    if errors:
        print(f"BigQuery insert errors: {json.dumps(errors, indent=2)}", file=sys.stderr)
        sys.exit(1)
    print(f"Inserted {len(new_rows)} new event rows into {table_ref}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    if not TM_API_KEY:
        print("Set TICKETMASTER_API_KEY in .env", file=sys.stderr)
        sys.exit(1)
    if not GCP_PROJECT:
        print("Set GCP_PROJECT in .env", file=sys.stderr)
        sys.exit(1)

    keyword = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else ""
    label = f"keyword={keyword!r}" if keyword else "all events"
    print(f"Fetching Ticketmaster events near SF ({label})")

    raw_events = fetch_all_events(keyword)
    if not raw_events:
        print("No events fetched.", file=sys.stderr)
        sys.exit(0)

    ts = datetime.now(timezone.utc).isoformat()
    seen_ids: set[str] = set()
    all_rows: list[dict[str, Any]] = []

    for ev in raw_events:
        eid = ev.get("id")
        if eid and eid not in seen_ids:
            seen_ids.add(eid)
            all_rows.append(flatten_event(ev, keyword, ts))

    print(f"\nTotal unique events: {len(all_rows)}")
    print("Sample row:")
    print(json.dumps(all_rows[0], indent=2, ensure_ascii=False))

    load_events_to_bq(all_rows)


if __name__ == "__main__":
    main()
