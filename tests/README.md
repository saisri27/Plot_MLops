# Plot — Tests Overview

This folder contains all tests for the Plot Decision Engine. They run automatically in
GitHub Actions (see `.github/workflows/ci.yml`) on every push / PR to `main` and `sai`.

Run everything locally:

```bash
pip install -r ../requirements.txt
python3 -m pytest tests/ -v
```

To also run the real BigQuery integration tests:

```bash
export RUN_BQ_INTEGRATION=1
python3 -m pytest tests/ -v
```

---

## 1) `test_decision_engine.py` — unit tests

What it covers from `decision_engine.py` (no network, no BigQuery, no DB):

| Test | What it checks |
|------|----------------|
| `test_budget_match_exact` | Same budget tier returns `1.0` |
| `test_budget_match_one_tier_off` | `low↔medium` and `medium↔high` return `0.5` |
| `test_budget_match_two_tiers_off` | `low↔high` returns `0.0` |
| `test_distance_score_within_range` | Closer venues score higher (linear) |
| `test_distance_score_zero_when_beyond_max` | Anything past `max_distance_km` scores `0` |
| `test_distance_score_at_max_is_zero` | Edge case at `distance == max` returns `0` |
| `test_merge_picks_most_conservative_budget_and_min_distance` | Group merging picks tightest budget, smallest distance, weighted categories |
| `test_compute_score_perfect_match_high_rating` | Perfect group/venue match returns `1.0` and includes "highly rated" reason |
| `test_compute_score_out_of_range_distance_drops_distance_term` | Beyond-range distance contributes `0` to total score |

## 2) `test_recommendation_bigquery.py` — unit tests with mocked BigQuery

What it covers from `recommendation_bigquery.py`:

| Test | What it checks |
|------|----------------|
| `test_normalize_google_price_level[...]` (parametrized × 9) | Maps Google `priceLevel` strings to `low / medium / high` (and unknowns default to `medium`) |
| `test_fetch_venues_returns_empty_list_when_no_categories` | Short-circuit returns `[]` when no categories are passed |
| `test_fetch_venues_normalizes_price_level_field` | Mocked BQ row with `PRICE_LEVEL_MODERATE` ends up as `medium` in the response dict |

These run fully offline using a mocked BigQuery client.

## 3) `test_bigquery_integration.py` — real BigQuery integration tests

These tests **only run when `RUN_BQ_INTEGRATION=1`** is set (otherwise they are skipped, so CI stays green without GCP credentials). They query the real tables described in `INFRASTRUCTURE.md`:

- `mlops-project-491402.places_raw.venues`
- `mlops-project-491402.places_raw.events`

| Test | What it checks against real data |
|------|-----------------------------------|
| `test_venues_rating_is_between_0_and_5` | No venue has a rating outside `[0, 5]` |
| `test_venues_distance_is_not_negative` | No venue has `distance_km < 0` |
| `test_events_non_ca_state_is_small_minority` | Share of non-CA events stays ≤ 5% (configurable via `BQ_MAX_NON_CA_STATE_SHARE`) |
| `test_events_same_day_duplicate_event_ids_are_zero` | No `(event_id, fetched_date)` group has more than one row (dedup works) |
| `test_events_daily_load_size_not_above_1000` | No single day has > 1000 event rows (matches Ticketmaster API cap) |

### Configurable env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `RUN_BQ_INTEGRATION` | `0` | Set to `1` to enable these tests |
| `BQ_PROJECT` | `mlops-project-491402` | GCP project id |
| `BQ_DATASET` | `places_raw` | Dataset name |
| `BQ_VENUES_TABLE` | `venues` | Venues table name |
| `BQ_EVENTS_TABLE` | `events` | Events table name |
| `BQ_MAX_NON_CA_STATE_SHARE` | `0.05` | Allowed share of non-CA event rows |

---

## How CI uses these tests

`.github/workflows/ci.yml` runs:

```bash
pip install -r requirements.txt
pytest tests/ -v
```

with `RUN_BQ_INTEGRATION=0`, so the unit tests in `test_decision_engine.py` and
`test_recommendation_bigquery.py` always run, and the integration tests in
`test_bigquery_integration.py` are skipped (they would need GCP credentials in CI).
