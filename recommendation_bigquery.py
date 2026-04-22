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
from typing import Any, List

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
    categories: List[str],
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
        d["price_level"] = normalize_google_price_level(
            raw_pl if isinstance(raw_pl, str) else None
        )
        out.append(d)
    return out


def fetch_events_from_bigquery(
    max_distance_miles: float,
    genres: List[str] | None = None,
    *,
    client: bigquery.Client | None = None,
) -> list[dict[str, Any]]:
    """
    Load event rows for display / future calendar + budget scoring.

    Each dict includes:
      name, category (genre preferred), price_min, price_max, distance_miles,
      start_datetime_utc, venue_name, event_url, image_url

    Note: decision_engine.compute_score is venue-oriented (price_level string).
    Use this data in a separate event scorer or extend the request model.
    """
    genre_filter = ""
    params: list = [
        bigquery.ScalarQueryParameter("max_distance", "FLOAT64", max_distance_miles),
    ]
    if genres:
        genre_filter = "AND (genre IN UNNEST(@genres) OR segment IN UNNEST(@genres))"
        params.append(bigquery.ArrayQueryParameter("genres", "STRING", genres))

    query = f"""
        SELECT
            name,
            COALESCE(NULLIF(TRIM(genre), ''), NULLIF(TRIM(segment), ''), 'Other') AS category,
            price_min,
            price_max,
            distance_miles,
            start_datetime_utc,
            venue_name,
            event_url,
            image_url
        FROM {_events_fqn()}
        WHERE distance_miles IS NOT NULL
          AND distance_miles <= @max_distance
        {genre_filter}
    """
    job_config = bigquery.QueryJobConfig(query_parameters=params)
    bq = client or _bq_client()
    rows = bq.query(query, job_config=job_config).result()
    return [dict(row.items()) for row in rows]
