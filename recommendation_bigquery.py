"""
BigQuery helpers for the Plot Decision Engine: venues and events for scoring / UI.

Uses the same tables as the scraping pipelines:
  `{GCP_PROJECT}.{BQ_DATASET}.{BQ_TABLE}`        — venues (default: places_raw.venues)
  `{GCP_PROJECT}.{BQ_DATASET}.{BQ_EVENTS_TABLE}` — events (default: places_raw.events)

Local / Cloud Run:
  pip install google-cloud-bigquery
  # Application Default Credentials (recommended):
  gcloud auth application-default login
  # Or:
  export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
"""

from __future__ import annotations

import os
from typing import Any

from google.cloud import bigquery

# Align with Data_scraping pipelines and INFRASTRUCTURE.md
GCP_PROJECT = os.environ.get("GCP_PROJECT", "mlops-project-491402").strip()
BQ_DATASET = os.environ.get("BQ_DATASET", "places_raw").strip()
BQ_VENUES_TABLE = os.environ.get("BQ_TABLE", "venues").strip()
BQ_EVENTS_TABLE = os.environ.get("BQ_EVENTS_TABLE", "events").strip()


def _venues_fqn() -> str:
    return f"`{GCP_PROJECT}.{BQ_DATASET}.{BQ_VENUES_TABLE}`"


def _events_fqn() -> str:
    return f"`{GCP_PROJECT}.{BQ_DATASET}.{BQ_EVENTS_TABLE}`"


def _bq_client() -> bigquery.Client:
    return bigquery.Client(project=GCP_PROJECT)


# Ticketmaster's segment taxonomy is coarser than our user-facing 11 categories.
# Music gets its own chip ("Music & Live Shows") because it's 51% of upcoming
# event volume — collapsing it into Entertainment hid the signal.
# Anything not mapped (Undefined, Miscellaneous, NULL) is bucketed to
# Entertainment so users still see those events under at least one chip;
# previously they were unreachable. Tune this mapping when we add a
# "Family"/"Film" feed.
SEGMENT_TO_CATEGORY: dict[str, str] = {
    "Music": "Music & Live Shows",
    "Arts & Theatre": "Arts & Culture",
    "Sports": "Sports & Recreation",
    "Family": "Entertainment",
    "Film": "Entertainment",
}
EVENT_FALLBACK_CATEGORY = "Entertainment"
KM_PER_MILE = 1.609344


def map_segment_to_category(segment: str | None) -> str:
    """Map a Ticketmaster segment to one of our canonical 11 categories."""
    if not segment:
        return EVENT_FALLBACK_CATEGORY
    return SEGMENT_TO_CATEGORY.get(segment.strip(), EVENT_FALLBACK_CATEGORY)


def normalize_google_price_level(price_level: str | None) -> str:
    """
    Map Google Places API priceLevel strings to decision_engine budget buckets.
    decision_engine.compute_score expects price_level in {low, medium, high}.
    """
    if not price_level:
        return "medium"
    p = price_level.strip().upper()
    if p in {"LOW", "MEDIUM", "HIGH"}:
        return price_level.strip().lower()
    if "INEXPENSIVE" in p or "FREE" in p:
        return "low"
    if "MODERATE" in p:
        return "medium"
    if "EXPENSIVE" in p or "VERY_EXPENSIVE" in p:
        return "high"
    return "medium"


def fetch_venues_from_bigquery(
    categories: list[str],
    max_distance_km: float,
    *,
    client: bigquery.Client | None = None,
) -> list[dict[str, Any]]:
    """
    Load venue candidates for recommendation scoring.

    Returns dicts compatible with decision_engine.compute_score:
      name, category, rating, distance_km, price_level (low|medium|high),
      plus optional: latitude, longitude, google_maps_uri, editorial_summary
    """
    if not categories:
        return []

    query = f"""
        SELECT
            display_name AS name,
            category,
            AVG(rating)        AS rating,
            MIN(distance_km)   AS distance_km,
            MAX(price_level)   AS price_level,
            AVG(latitude)      AS latitude,
            AVG(longitude)     AS longitude,
            MAX(google_maps_uri)     AS google_maps_uri,
            MAX(editorial_summary)   AS editorial_summary
        FROM {_venues_fqn()}
        WHERE distance_km IS NOT NULL
          AND distance_km <= @max_distance
          AND rating IS NOT NULL
          AND category IN UNNEST(@categories)
        GROUP BY display_name, category
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("max_distance", "FLOAT64", max_distance_km),
            bigquery.ArrayQueryParameter("categories", "STRING", categories),
        ]
    )
    bq = client or _bq_client()
    rows = bq.query(query, job_config=job_config).result()
    out: list[dict[str, Any]] = []
    for row in rows:
        d = dict(row.items())
        raw_pl = d.get("price_level")
        d["price_level"] = normalize_google_price_level(raw_pl if isinstance(raw_pl, str) else None)
        out.append(d)
    return out


def fetch_events_from_bigquery(
    categories: list[str],
    max_distance_km: float,
    *,
    days_ahead: int = 60,
    client: bigquery.Client | None = None,
) -> list[dict[str, Any]]:
    """
    Load upcoming events for the /events endpoint.

    Filters past events at the SQL boundary (start_datetime_utc > NOW), so the
    caller never sees a stale row. The events table stores distance in MILES;
    we convert to KM in the output so callers can use one unit everywhere.

    Args:
        categories: user-selected canonical categories (e.g. ["Entertainment",
            "Arts & Culture"]). Empty list returns []. We SELECT all upcoming
            events whose Ticketmaster segment maps to one of these.
        max_distance_km: filter on distance_miles converted to km in SQL.
        days_ahead: only include events starting within this many days; clamps
            absurdly far-future Ticketmaster rows out of the demo.

    Returns:
        Dicts with: name, category (canonical, mapped from segment), price_min,
        price_max, price_currency, distance_km, start_datetime_utc, venue_name,
        event_url, image_url, segment, genre.
    """
    if not categories:
        return []

    # Reverse the segment→category map so we can filter at SQL time on the
    # (smaller) set of segments that produce the user's chosen categories.
    wanted_segments = [seg for seg, cat in SEGMENT_TO_CATEGORY.items() if cat in set(categories)]
    # If "Entertainment" is selected, also include the fallback bucket
    # (Undefined / Miscellaneous / null segment) so those rows aren't lost.
    include_fallback = EVENT_FALLBACK_CATEGORY in set(categories)

    # Build the segment filter dynamically so callers don't need to know about
    # the fallback bucket. Either the segment is in our wanted list, OR it's a
    # null / unknown segment when the fallback category is selected.
    segment_clauses = []
    params: list = [
        bigquery.ScalarQueryParameter(
            "max_distance_miles", "FLOAT64", max_distance_km / KM_PER_MILE
        ),
        bigquery.ScalarQueryParameter("days_ahead", "INT64", days_ahead),
    ]
    if wanted_segments:
        segment_clauses.append("segment IN UNNEST(@segments)")
        params.append(bigquery.ArrayQueryParameter("segments", "STRING", wanted_segments))
    if include_fallback:
        segment_clauses.append(
            "(segment IS NULL OR TRIM(segment) IN ('', 'Undefined', 'Miscellaneous'))"
        )
    if not segment_clauses:
        return []

    segment_filter = " OR ".join(segment_clauses)

    # The events table is append-only: every cron run inserts a fresh row per
    # event_id. The insert-time dedup in events_to_bq.py only blocks SAME-DAY
    # re-inserts, so once the 3x/week scrape kicks in, an upcoming Symphony
    # show will pile up across days. Dedup at query time by event_id, keeping
    # the most recently fetched row via QUALIFY ROW_NUMBER().
    query = f"""
        SELECT
            name,
            segment,
            genre,
            price_min,
            price_max,
            price_currency,
            distance_miles,
            distance_miles * {KM_PER_MILE} AS distance_km,
            start_datetime_utc,
            venue_name,
            event_url,
            image_url
        FROM {_events_fqn()}
        WHERE distance_miles IS NOT NULL
          AND distance_miles <= @max_distance_miles
          AND start_datetime_utc IS NOT NULL
          AND start_datetime_utc > CURRENT_TIMESTAMP()
          AND start_datetime_utc < TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL @days_ahead DAY)
          AND ({segment_filter})
        QUALIFY ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY fetched_at DESC) = 1
        ORDER BY start_datetime_utc ASC
        LIMIT 100
    """
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    bq = client or _bq_client()
    rows = bq.query(query, job_config=job_config).result()

    out: list[dict[str, Any]] = []
    for row in rows:
        d = dict(row.items())
        d["category"] = map_segment_to_category(d.get("segment"))
        out.append(d)
    return out
