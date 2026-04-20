from __future__ import annotations

import os

import pytest

bigquery = pytest.importorskip("google.cloud.bigquery")


RUN_INTEGRATION = os.getenv("RUN_BQ_INTEGRATION", "0").lower() in {"1", "true", "yes"}
PROJECT = os.getenv("BQ_PROJECT", "mlops-project-491402")
DATASET = os.getenv("BQ_DATASET", "places_raw")
VENUES_TABLE = os.getenv("BQ_VENUES_TABLE", "venues")
EVENTS_TABLE = os.getenv("BQ_EVENTS_TABLE", "events")


pytestmark = pytest.mark.skipif(
    not RUN_INTEGRATION,
    reason="Set RUN_BQ_INTEGRATION=1 to run real BigQuery integration tests.",
)


def _client() -> bigquery.Client:
    return bigquery.Client(project=PROJECT)


def _fq(table_name: str) -> str:
    return f"`{PROJECT}.{DATASET}.{table_name}`"


def test_venues_rating_is_between_0_and_5():
    query = f"""
        SELECT COUNT(*) AS invalid_count
        FROM {_fq(VENUES_TABLE)}
        WHERE rating IS NOT NULL
          AND (rating < 0 OR rating > 5)
    """
    rows = list(_client().query(query).result())
    assert rows[0].invalid_count == 0


def test_venues_distance_is_not_negative():
    query = f"""
        SELECT COUNT(*) AS invalid_count
        FROM {_fq(VENUES_TABLE)}
        WHERE distance_km IS NOT NULL
          AND distance_km < 0
    """
    rows = list(_client().query(query).result())
    assert rows[0].invalid_count == 0


def test_events_non_ca_state_is_small_minority():
    """30-mile SF search can include a few border/out-of-state venues (e.g. NV)."""
    # Default 5%: strict "all CA" is unrealistic for radius-based Ticketmaster data.
    max_share = float(os.getenv("BQ_MAX_NON_CA_STATE_SHARE", "0.05"))
    query = f"""
        SELECT
          COUNTIF(venue_state IS NOT NULL AND UPPER(venue_state) != 'CA') AS non_ca,
          COUNTIF(venue_state IS NOT NULL) AS with_state
        FROM {_fq(EVENTS_TABLE)}
    """
    rows = list(_client().query(query).result())
    non_ca = rows[0].non_ca
    with_state = rows[0].with_state
    if with_state == 0:
        pytest.skip("No events with venue_state set")
    share = non_ca / with_state
    assert share <= max_share, (
        f"non-CA share {share:.4f} exceeds {max_share}: non_ca={non_ca}, with_state={with_state}"
    )


def test_events_same_day_duplicate_event_ids_are_zero():
    query = f"""
        WITH dupes AS (
          SELECT event_id, DATE(fetched_at) AS fetch_date, COUNT(*) AS c
          FROM {_fq(EVENTS_TABLE)}
          GROUP BY event_id, fetch_date
          HAVING COUNT(*) > 1
        )
        SELECT COUNT(*) AS dup_group_count FROM dupes
    """
    rows = list(_client().query(query).result())
    assert rows[0].dup_group_count == 0


def test_events_daily_load_size_not_above_1000():
    # Script caps one run at 1000 unique events. We validate that no single
    # day's inserted rows explode unexpectedly.
    query = f"""
        WITH daily AS (
          SELECT DATE(fetched_at) AS fetch_date, COUNT(*) AS c
          FROM {_fq(EVENTS_TABLE)}
          GROUP BY fetch_date
        )
        SELECT COUNT(*) AS bad_days
        FROM daily
        WHERE c > 1000
    """
    rows = list(_client().query(query).result())
    assert rows[0].bad_days == 0
