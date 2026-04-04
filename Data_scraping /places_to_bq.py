"""
Fetch places from Google Places API (New) and write rows to BigQuery.

Designed to run on a GCP VM with a service account that has
  - roles/bigquery.dataEditor  (write to the target table)
  - roles/bigquery.jobUser     (run load jobs)

On a VM the default service-account credentials are picked up automatically.
For local dev you can export GOOGLE_APPLICATION_CREDENTIALS pointing to a
service-account key JSON, or just rely on `gcloud auth application-default login`.

Usage:
    python places_to_bq.py                         # uses SEARCH_QUERIES from .env
    python places_to_bq.py "tacos in San Francisco" "pizza in Oakland"
"""

from __future__ import annotations

import json
import math
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
# Config — all overridable via .env
# ---------------------------------------------------------------------------
API_KEY = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
GCP_PROJECT = os.environ.get("GCP_PROJECT", "").strip()
BQ_DATASET = os.environ.get("BQ_DATASET", "places_raw").strip()
BQ_TABLE = os.environ.get("BQ_TABLE", "places").strip()
DEFAULT_QUERIES = os.environ.get(
    "SEARCH_QUERIES",
    # Broad categories — combined with grid search these cover SF thoroughly
    "restaurants in San Francisco;"
    "cafes in San Francisco;"
    "bars in San Francisco;"
    "parks in San Francisco;"
    "museums in San Francisco;"
    "nightlife in San Francisco;"
    "things to do in San Francisco;"
    "date spots in San Francisco;"
    "dessert in San Francisco;"
    "brunch in San Francisco;"
    "live music in San Francisco;"
    "art galleries in San Francisco;"
    "bookstores in San Francisco;"
    "spas in San Francisco;"
    "bowling in San Francisco",
).strip()

PLACES_URL = "https://places.googleapis.com/v1/places:searchText"
USE_GRID = os.environ.get("USE_GRID", "true").strip().lower() == "true"

SF_CENTER_LAT = 37.7749
SF_CENTER_LNG = -122.4194

# Single large circle (used when USE_GRID=false)
SF_LOCATION_BIAS = {
    "circle": {
        "center": {"latitude": SF_CENTER_LAT, "longitude": SF_CENTER_LNG},
        "radius": 8000.0,
    }
}

# 3×3 grid covering SF — each cell is a 2.5 km-radius circle.
# Overlap is intentional; dedup by place_id removes duplicates.
#
#   NW  (Presidio/Richmond)  |  N  (Marina/PacHts)    |  NE (NorthBeach/FiDi)
#   W   (Sunset/GoldenGate)  |  C  (Haight/Castro)    |  E  (SOMA/Mission)
#   SW  (OuterSunset/Merced) |  S  (Excelsior/Bernal) |  SE (Bayview/Dogpatch)
#
_GRID_LATS = [37.727, 37.760, 37.793]
_GRID_LNGS = [-122.488, -122.445, -122.402]
_GRID_RADIUS = 2500.0

SF_GRID: list[dict] = [
    {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": _GRID_RADIUS}}
    for lat in _GRID_LATS
    for lng in _GRID_LNGS
]

FIELD_MASK = ",".join(
    [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.types",
        "places.rating",
        "places.userRatingCount",
        "places.businessStatus",
        "places.priceLevel",
        "places.websiteUri",
        "places.nationalPhoneNumber",
        "places.googleMapsUri",
        "places.primaryType",
        "places.editorialSummary",
        "places.regularOpeningHours",
        "nextPageToken",
    ]
)

# ---------------------------------------------------------------------------
# Type → category mapping
# Uses primary_type first, then falls back to first match in types list.
# Add new Google Places types here as you discover them.
# ---------------------------------------------------------------------------
TYPE_TO_CATEGORY: dict[str, str] = {
    # Food & Drink
    "restaurant": "Food & Drink",
    "cafe": "Food & Drink",
    "coffee_shop": "Food & Drink",
    "bakery": "Food & Drink",
    "bar": "Food & Drink",
    "wine_bar": "Food & Drink",
    "brewery": "Food & Drink",
    "meal_takeaway": "Food & Drink",
    "meal_delivery": "Food & Drink",
    "ice_cream_shop": "Food & Drink",
    "dessert_shop": "Food & Drink",
    "sandwich_shop": "Food & Drink",
    "pizza_restaurant": "Food & Drink",
    "breakfast_restaurant": "Food & Drink",
    "brunch_restaurant": "Food & Drink",
    "seafood_restaurant": "Food & Drink",
    "steak_house": "Food & Drink",
    "sushi_restaurant": "Food & Drink",
    "ramen_restaurant": "Food & Drink",
    "tea_house": "Food & Drink",
    "juice_shop": "Food & Drink",
    "bagel_shop": "Food & Drink",
    "deli": "Food & Drink",
    "confectionery": "Food & Drink",
    "food_store": "Food & Drink",

    # Nightlife
    "night_club": "Nightlife",
    "karaoke": "Nightlife",
    "comedy_club": "Nightlife",
    "live_music_venue": "Nightlife",

    # Arts & Culture
    "museum": "Arts & Culture",
    "art_gallery": "Arts & Culture",
    "performing_arts_theater": "Arts & Culture",
    "cultural_center": "Arts & Culture",
    "library": "Arts & Culture",

    # Outdoors & Parks
    "park": "Outdoors",
    "hiking_area": "Outdoors",
    "national_park": "Outdoors",
    "garden": "Outdoors",
    "playground": "Outdoors",
    "campground": "Outdoors",
    "marina": "Outdoors",
    "beach": "Outdoors",

    # Sports & Recreation
    "bowling_alley": "Sports & Recreation",
    "gym": "Sports & Recreation",
    "fitness_center": "Sports & Recreation",
    "rock_climbing": "Sports & Recreation",
    "swimming_pool": "Sports & Recreation",
    "skating_rink": "Sports & Recreation",
    "ice_skating_rink": "Sports & Recreation",
    "sports_club": "Sports & Recreation",
    "golf_course": "Sports & Recreation",
    "athletic_field": "Sports & Recreation",
    "archery": "Sports & Recreation",
    "sports_complex": "Sports & Recreation",

    # Wellness & Beauty
    "spa": "Wellness & Beauty",
    "yoga_studio": "Wellness & Beauty",
    "hair_salon": "Wellness & Beauty",
    "beauty_salon": "Wellness & Beauty",
    "nail_salon": "Wellness & Beauty",
    "massage": "Wellness & Beauty",
    "skin_care_clinic": "Wellness & Beauty",

    # Classes & Workshops
    "dance_school": "Classes & Workshops",
    "cooking_class": "Classes & Workshops",
    "pottery_studio": "Classes & Workshops",
    "art_studio": "Classes & Workshops",
    "school": "Classes & Workshops",
    "training_center": "Classes & Workshops",

    # Entertainment
    "escape_room": "Entertainment",
    "amusement_center": "Entertainment",
    "amusement_park": "Entertainment",
    "movie_theater": "Entertainment",
    "board_game_cafe": "Entertainment",
    "laser_tag": "Entertainment",
    "mini_golf": "Entertainment",
    "arcade": "Entertainment",
    "tourist_attraction": "Entertainment",
    "aquarium": "Entertainment",
    "zoo": "Entertainment",

    # Pets & Animals
    "pet_store": "Pets & Animals",
    "veterinary_care": "Pets & Animals",
    "dog_park": "Pets & Animals",
    "petting_zoo": "Pets & Animals",
    "animal_shelter": "Pets & Animals",

    # Shopping & Thrift
    "shopping_mall": "Shopping",
    "book_store": "Shopping",
    "clothing_store": "Shopping",
    "gift_shop": "Shopping",
    "thrift_store": "Shopping",
    "second_hand_store": "Shopping",
    "vintage_store": "Shopping",
    "florist": "Shopping",
    "jewelry_store": "Shopping",
    "home_goods_store": "Shopping",
    "furniture_store": "Shopping",
    "store": "Shopping",

    # Cute / Date Spots
    "bubble_tea": "Food & Drink",
    "chocolate_shop": "Food & Drink",
    "fondue_restaurant": "Food & Drink",
    "french_restaurant": "Food & Drink",
    "italian_restaurant": "Food & Drink",
    "japanese_restaurant": "Food & Drink",
    "korean_restaurant": "Food & Drink",
    "mediterranean_restaurant": "Food & Drink",
    "mexican_restaurant": "Food & Drink",
    "thai_restaurant": "Food & Drink",
    "vietnamese_restaurant": "Food & Drink",
    "vegan_restaurant": "Food & Drink",
    "vegetarian_restaurant": "Food & Drink",
}

# Generic types to ignore when resolving category
_SKIP_TYPES = {
    "point_of_interest", "establishment", "food", "store",
    "health", "finance", "general_contractor", "locality",
    "political", "geocode",
}


def resolve_category(primary_type: str | None, types: list[str]) -> str:
    """Return a broad category string from the type info."""
    if primary_type and primary_type in TYPE_TO_CATEGORY:
        return TYPE_TO_CATEGORY[primary_type]
    for t in types:
        if t in _SKIP_TYPES:
            continue
        if t in TYPE_TO_CATEGORY:
            return TYPE_TO_CATEGORY[t]
    return "Other"


# BigQuery table schema — created automatically if missing
BQ_SCHEMA = [
    bigquery.SchemaField("place_id", "STRING", mode="REQUIRED"),
    bigquery.SchemaField("display_name", "STRING"),
    bigquery.SchemaField("formatted_address", "STRING"),
    bigquery.SchemaField("latitude", "FLOAT"),
    bigquery.SchemaField("longitude", "FLOAT"),
    bigquery.SchemaField("distance_km", "FLOAT"),
    bigquery.SchemaField("rating", "FLOAT"),
    bigquery.SchemaField("user_rating_count", "INTEGER"),
    bigquery.SchemaField("business_status", "STRING"),
    bigquery.SchemaField("price_level", "STRING"),
    bigquery.SchemaField("primary_type", "STRING"),
    bigquery.SchemaField("category", "STRING"),
    bigquery.SchemaField("types", "STRING", mode="REPEATED"),
    bigquery.SchemaField("phone_number", "STRING"),
    bigquery.SchemaField("website_uri", "STRING"),
    bigquery.SchemaField("google_maps_uri", "STRING"),
    bigquery.SchemaField("editorial_summary", "STRING"),
    bigquery.SchemaField("open_now_text", "STRING"),
    bigquery.SchemaField("search_query", "STRING"),
    bigquery.SchemaField("fetched_at", "TIMESTAMP"),
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance between two points in kilometres."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlng / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def flatten_place(raw: dict[str, Any], query: str, ts: str) -> dict[str, Any]:
    """Turn one Places API JSON object into a flat dict matching BQ_SCHEMA."""
    loc = raw.get("location") or {}
    dn = raw.get("displayName") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")

    dist = None
    if lat is not None and lng is not None:
        dist = round(haversine_km(SF_CENTER_LAT, SF_CENTER_LNG, lat, lng), 3)

    hours = raw.get("regularOpeningHours") or {}
    weekday_text = hours.get("weekdayDescriptions")
    open_now_text = "; ".join(weekday_text) if weekday_text else None

    summary = raw.get("editorialSummary") or {}
    primary_type = raw.get("primaryType")
    types = raw.get("types", [])

    return {
        "place_id": raw.get("id"),
        "display_name": dn.get("text"),
        "formatted_address": raw.get("formattedAddress"),
        "latitude": lat,
        "longitude": lng,
        "distance_km": dist,
        "rating": raw.get("rating"),
        "user_rating_count": raw.get("userRatingCount"),
        "business_status": raw.get("businessStatus"),
        "price_level": raw.get("priceLevel"),
        "primary_type": primary_type,
        "category": resolve_category(primary_type, types),
        "types": types,
        "phone_number": raw.get("nationalPhoneNumber"),
        "website_uri": raw.get("websiteUri"),
        "google_maps_uri": raw.get("googleMapsUri"),
        "editorial_summary": summary.get("text"),
        "open_now_text": open_now_text,
        "search_query": query,
        "fetched_at": ts,
    }


def fetch_places(
    query: str,
    location_bias: dict | None = None,
    max_pages: int = 3,
) -> list[dict[str, Any]]:
    """Call Text Search, follow nextPageToken up to *max_pages* pages."""
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": FIELD_MASK,
    }
    body: dict[str, Any] = {
        "textQuery": query,
        "locationBias": location_bias or SF_LOCATION_BIAS,
    }
    all_places: list[dict[str, Any]] = []

    for page in range(max_pages):
        resp = requests.post(PLACES_URL, headers=headers, json=body, timeout=30)
        if not resp.ok:
            print(f"  API error {resp.status_code}: {resp.text}", file=sys.stderr)
            break
        data = resp.json()
        places = data.get("places", [])
        all_places.extend(places)
        print(f"    page {page + 1}: got {len(places)} places")

        npt = data.get("nextPageToken")
        if not npt:
            break
        body["pageToken"] = npt
        time.sleep(2)

    return all_places


def ensure_table(client: bigquery.Client, table_ref: str) -> bigquery.Table:
    """Create dataset + table if they don't exist yet."""
    dataset_ref = f"{GCP_PROJECT}.{BQ_DATASET}"
    dataset = bigquery.Dataset(dataset_ref)
    dataset.location = "US"
    client.create_dataset(dataset, exists_ok=True)

    try:
        table = client.get_table(table_ref)
        return table
    except Exception:
        pass

    table = bigquery.Table(table_ref, schema=BQ_SCHEMA)
    table = client.create_table(table)
    print("Created new table — waiting 30s for BigQuery to be ready...")
    time.sleep(30)
    return table


def get_existing_place_keys(client: bigquery.Client, table_ref: str) -> set[str]:
    """Return set of (place_id, date) keys already in the table for dedup.

    Allows the same place to be inserted on different days so we capture
    rating / review-count changes over time (living dataset).
    """
    try:
        query = (
            f"SELECT DISTINCT place_id, DATE(fetched_at) AS fetch_date "
            f"FROM `{table_ref}`"
        )
        result = client.query(query).result()
        return {f"{row.place_id}_{row.fetch_date}" for row in result}
    except Exception:
        return set()


def load_to_bq(rows: list[dict[str, Any]]) -> None:
    """Load rows into BigQuery, skipping places already scraped today."""
    client = bigquery.Client(project=GCP_PROJECT)
    table_ref = f"{GCP_PROJECT}.{BQ_DATASET}.{BQ_TABLE}"
    ensure_table(client, table_ref)

    existing = get_existing_place_keys(client, table_ref)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    new_rows = [r for r in rows if f"{r['place_id']}_{today}" not in existing]
    skipped = len(rows) - len(new_rows)

    if skipped:
        print(f"Skipping {skipped} places already scraped today ({today})")
    if not new_rows:
        print("All rows already exist for today — nothing new to insert.")
        return

    errors = client.insert_rows_json(table_ref, new_rows)
    if errors:
        print(f"BigQuery insert errors: {json.dumps(errors, indent=2)}", file=sys.stderr)
        sys.exit(1)
    print(f"Inserted {len(new_rows)} new rows into {table_ref}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def _grid_label(bias: dict) -> str:
    """Human-readable label for a grid cell, e.g. '(37.760, -122.445)'."""
    c = bias["circle"]["center"]
    return f"({c['latitude']:.3f}, {c['longitude']:.3f})"


def main() -> None:
    if not API_KEY:
        print("Set GOOGLE_PLACES_API_KEY in .env", file=sys.stderr)
        sys.exit(1)
    if not GCP_PROJECT:
        print("Set GCP_PROJECT in .env (your Google Cloud project ID)", file=sys.stderr)
        sys.exit(1)

    queries = sys.argv[1:] if len(sys.argv) > 1 else [
        q.strip() for q in DEFAULT_QUERIES.split(";") if q.strip()
    ]

    grid = SF_GRID if USE_GRID else [SF_LOCATION_BIAS]
    print(f"Grid mode: {'ON — {0} cells'.format(len(grid)) if USE_GRID else 'OFF — single circle'}")
    print(f"Queries: {len(queries)}")
    print(f"Total search combinations: {len(queries) * len(grid)}")

    ts = datetime.now(timezone.utc).isoformat()
    seen_ids: set[str] = set()
    all_rows: list[dict[str, Any]] = []

    for query in queries:
        for cell in grid:
            label = _grid_label(cell) if USE_GRID else "SF-wide"
            print(f"\nFetching: {query!r}  [{label}]")
            raw_places = fetch_places(query, location_bias=cell)
            added = 0
            for p in raw_places:
                pid = p.get("id")
                if pid and pid not in seen_ids:
                    seen_ids.add(pid)
                    all_rows.append(flatten_place(p, query, ts))
                    added += 1
            print(f"    → {added} new unique places (skipped {len(raw_places) - added} in-batch dupes)")

    if not all_rows:
        print("No places fetched — nothing to write.", file=sys.stderr)
        sys.exit(0)

    print(f"\nTotal unique rows to load: {len(all_rows)}")
    print("Sample row:")
    print(json.dumps(all_rows[0], indent=2, ensure_ascii=False))

    load_to_bq(all_rows)


if __name__ == "__main__":
    main()
