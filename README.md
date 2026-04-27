# Plot

Group date and hangout planner for San Francisco. Plot helps two or more people coordinate outings — dinner, events, activities — by merging everyone's preferences (budget, cuisine, distance, availability) and recommending ranked options pulled from live venue and event data.

Built as an MLOps class project. See [INFRASTRUCTURE.md](INFRASTRUCTURE.md) for the full system design, GCP stack, and cost justification.

---

## Current state

- System design doc ([INFRASTRUCTURE.md](INFRASTRUCTURE.md))
- **Decision Engine** FastAPI service v0.3.0: `/`, `/health`, `/recommend`, `/feedback` ([decision_engine.py](decision_engine.py))
- **BigQuery** venue and event retrieval layer ([recommendation_bigquery.py](recommendation_bigquery.py))
- **Supabase** user, recommendation-log, and feedback storage ([db.py](db.py))
- **LLM reranker** (`gpt-4o-mini`) takes the v0 top-20 and produces a final top-K with per-venue reasons; falls back to v0 heuristic on any failure or missing key ([llm_rerank.py](llm_rerank.py), [prompts/rerank_v1.txt](prompts/rerank_v1.txt))
- **Data scraping** pipelines for Google Places and Ticketmaster ([Data_scraping /README.md](Data_scraping%20/README.md))
- **Browser demo UI** with a banner showing whether results were LLM-ranked or v0 ([demo/README.md](demo/README.md))
- **CI** with pytest, ruff lint, and ruff format check on every push and PR ([.github/workflows/ci.yml](.github/workflows/ci.yml))
- **Tests**: unit tests for scoring / preference merging / price-level normalization, offline LLM rerank tests with a fake OpenAI client, `/recommend` wiring tests with mocked BigQuery + LLM, plus opt-in BigQuery integration tests

What's coming next: prompt versioning (`rerank_v2`), MLflow prompt registry, eval pipeline that replays logged feedback through prompts, Google Calendar FreeBusy integration, Cloud Run deployment, drift monitoring.

---

## Repo layout

| Path | Purpose |
|------|---------|
| [decision_engine.py](decision_engine.py) | FastAPI service — group preference merging, venue scoring, LLM rerank wiring, recommendation + feedback endpoints |
| [llm_rerank.py](llm_rerank.py) | OpenAI-backed reranker that turns the v0 top-20 into a final top-K with per-venue reasons |
| [prompts/](prompts/) | Versioned prompt templates loaded by the reranker (`rerank_v1.txt`) |
| [recommendation_bigquery.py](recommendation_bigquery.py) | BigQuery helpers for fetching venues and events |
| [db.py](db.py) | Supabase (Postgres) layer for users, recommendation logs, and feedback |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | System design, GCP stack, cost estimate, ML model strategy |
| [Data_scraping /](Data_scraping%20/) | Google Places + Ticketmaster → BigQuery pipelines |
| [demo/](demo/) | Standalone browser UI that calls `/recommend` |
| [tests/](tests/) | Unit tests, offline LLM + `/recommend` tests, opt-in BigQuery integration tests |
| [FastAPI/](FastAPI/) | Week 1 wine-classifier exercise (legacy, kept for reference) |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | GitHub Actions — lint + test on every push / PR |
| [pyproject.toml](pyproject.toml) | Ruff + pytest config (incl. `live` marker) |
| [.pre-commit-config.yaml](.pre-commit-config.yaml) | Pre-commit hook running ruff on staged files |
| [cloudbuild.yaml](cloudbuild.yaml) | Google Cloud Build — builds the Decision Engine Docker image |

---

## Quick start

Five-minute path to a running local service.

```bash
# 1. Setup
git clone git@github.com:saisri27/Plot_MLops.git
cd Plot_MLops
conda create -n plot python=3.11 -y
conda activate plot
pip install -r requirements.txt
pre-commit install

# 2. Credentials
cp "Data_scraping /.env.example" .env
# Edit .env: fill in GCP_PROJECT, DATABASE_URL, MLFLOW_TRACKING_URI, OPENAI_API_KEY
gcloud auth application-default login    # for BigQuery

# 3. Run the API
uvicorn decision_engine:app --reload --port 8080
curl http://127.0.0.1:8080/health

# 4. (Optional) Run the browser demo UI
python3 -m http.server 5500
# open http://127.0.0.1:5500/demo/demo.html
```

If `/recommend` returns 503 with a BigQuery error, you skipped `gcloud auth application-default login` — the API can't read from BigQuery without it.

### LLM reranker (optional)

Get a key at https://platform.openai.com/api-keys and put it in `.env` as `OPENAI_API_KEY`.

- **With key set**: `/recommend` reranks the v0 top-20 with `gpt-4o-mini` and returns LLM-written reasons. Cost is roughly $0.0005 per call. The demo UI shows an "LLM-ranked" banner above the results, including the model and latency.
- **Without key**: the engine logs a one-time warning at startup and silently falls back to v0 heuristic ranking. Demo UI shows the "Heuristic ranking (v0)" banner.

The fallback path is also taken on any LLM error (timeout, malformed response, all picks hallucinated), so a flaky API never breaks `/recommend`.

### Response shape

`POST /recommend` returns the top-K recommendations plus rerank metadata:

```
{
  "merged_budget": "...", "merged_max_distance_km": ...,
  "merged_categories": [...], "group_size": ..., "venues_scored": ...,
  "recommendations": [{"name": "...", "score": ..., "reason": "...", ...}],
  "used_llm": true,                    // false on v0 fallback
  "llm_model": "gpt-4o-mini",          // null on fallback
  "prompt_version": "rerank_v1",       // null on fallback
  "llm_latency_ms": 812,               // null on fallback
  "recommendation_log_id": 42          // null when DATABASE_URL is unset
}
```

`recommendation_log_id` is the SERIAL id from the `recommendation_log` table — the `/feedback` retraining loop will use it as a join key to reconstruct the candidate set behind each accepted/rejected pick.

---

## Testing

```bash
# Unit + offline integration tests, LLM live-test skipped (matches CI behavior)
pytest tests/ -v -m "not live" --ignore=tests/test_bigquery_integration.py

# Live OpenAI integration test (needs OPENAI_API_KEY)
pytest tests/test_llm_rerank.py -v -m live

# BigQuery integration tests (opt-in, needs ADC)
RUN_BQ_INTEGRATION=1 pytest tests/test_bigquery_integration.py -v

# Lint + format check
ruff check .
ruff format --check .
```

Test files in `tests/`:

- `test_decision_engine.py` — scoring, preference merging, price-level normalization
- `test_recommendation_bigquery.py` — BigQuery helpers with a mocked client
- `test_llm_rerank.py` — LLM reranker with a fake OpenAI client (offline) plus one `@pytest.mark.live` smoke test
- `test_decision_engine_with_llm.py` — `/recommend` wiring with both BigQuery and the LLM mocked out, covering both the LLM-success and v0-fallback paths
- `test_bigquery_integration.py` — opt-in queries against the real `mlops-project-491402.places_raw.*` tables (data-quality assertions)

CI runs lint + `pytest -m "not live"` automatically on every push and pull request. Live LLM tests and BigQuery integration tests are intentionally skipped in CI because they require external credentials.

---

## Architecture

Three-layer: **Frontend** (React, browser) → **API** (FastAPI Decision Engine on Cloud Run) → **Data** (BigQuery venues/events + Supabase users/feedback + MLflow model registry). Full diagram and per-component justification in [INFRASTRUCTURE.md](INFRASTRUCTURE.md).

---
