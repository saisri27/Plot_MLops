"""
Sample script to test Ticketmaster Discovery API and inspect the response schema.

Usage:
    python sample_events.py
    python sample_events.py "concerts"
    python sample_events.py "comedy" 5
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

API_KEY = os.environ.get("TICKETMASTER_API_KEY", "").strip()
BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json"

SF_LATLONG = "37.7749,-122.4194"
RADIUS = "30"
UNIT = "miles"


def fetch_events(keyword: str = "", size: int = 5) -> dict:
    """Fetch events from Ticketmaster Discovery API for San Francisco."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    params = {
        "apikey": API_KEY,
        "latlong": SF_LATLONG,
        "radius": RADIUS,
        "unit": UNIT,
        "size": size,
        "startDateTime": now,
        "sort": "date,asc",
    }
    if keyword:
        params["keyword"] = keyword

    print(f"Request: GET {BASE_URL}")
    print(f"Params:  {json.dumps(params, indent=2)}\n")

    resp = requests.get(BASE_URL, params=params, timeout=30)
    print(f"Status:  {resp.status_code}")

    if not resp.ok:
        print(f"Error:   {resp.text}")
        sys.exit(1)

    return resp.json()


def print_schema(event: dict, prefix: str = "") -> None:
    """Recursively print the keys and types in an event object."""
    for key, value in event.items():
        full_key = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            print(f"  {full_key}: dict")
            print_schema(value, full_key)
        elif isinstance(value, list):
            print(f"  {full_key}: list[{len(value)} items]")
            if value and isinstance(value[0], dict):
                print_schema(value[0], f"{full_key}[0]")
        else:
            val_str = str(value)[:80] if value else "null"
            print(f"  {full_key}: {type(value).__name__} = {val_str}")


def main() -> None:
    if not API_KEY:
        print("Set TICKETMASTER_API_KEY in .env", file=sys.stderr)
        sys.exit(1)

    keyword = sys.argv[1] if len(sys.argv) > 1 else ""
    size = int(sys.argv[2]) if len(sys.argv) > 2 else 5

    data = fetch_events(keyword=keyword, size=size)

    # Top-level response structure
    print("\n" + "=" * 60)
    print("TOP-LEVEL RESPONSE KEYS")
    print("=" * 60)
    for k, v in data.items():
        print(f"  {k}: {type(v).__name__}")

    # Pagination info
    page_info = data.get("page", {})
    print(f"\nPagination: {json.dumps(page_info, indent=2)}")

    # Events
    embedded = data.get("_embedded", {})
    events = embedded.get("events", [])
    print(f"\nEvents returned: {len(events)}")

    if not events:
        print("No events found.")
        return

    # Schema of first event
    print("\n" + "=" * 60)
    print("SCHEMA OF FIRST EVENT")
    print("=" * 60)
    print_schema(events[0])

    # Print full first event JSON
    print("\n" + "=" * 60)
    print("FULL JSON — FIRST EVENT")
    print("=" * 60)
    print(json.dumps(events[0], indent=2, ensure_ascii=False))

    # Summary of all fetched events
    print("\n" + "=" * 60)
    print(f"SUMMARY OF ALL {len(events)} EVENTS")
    print("=" * 60)
    for i, ev in enumerate(events):
        name = ev.get("name", "?")
        event_type = ev.get("type", "?")
        dates = ev.get("dates", {})
        start = dates.get("start", {})
        start_local = start.get("localDate", "?")
        start_time = start.get("localTime", "")

        venue_name = "?"
        venues = (ev.get("_embedded") or {}).get("venues", [])
        if venues:
            venue_name = venues[0].get("name", "?")

        classifications = ev.get("classifications", [])
        segment = ""
        genre = ""
        if classifications:
            segment = (classifications[0].get("segment") or {}).get("name", "")
            genre = (classifications[0].get("genre") or {}).get("name", "")

        price_min = ""
        price_max = ""
        price_ranges = ev.get("priceRanges", [])
        if price_ranges:
            price_min = price_ranges[0].get("min", "")
            price_max = price_ranges[0].get("max", "")

        print(
            f"  [{i+1}] {name}\n"
            f"      Date: {start_local} {start_time}  |  Venue: {venue_name}\n"
            f"      Type: {segment}/{genre}  |  Price: ${price_min}–${price_max}"
        )


if __name__ == "__main__":
    main()
