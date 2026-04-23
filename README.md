# Plot

Group date and hangout planner for San Francisco. Plot helps two or more people coordinate outings — dinner, events, activities — by merging everyone's preferences (budget, cuisine, distance, availability) and recommending ranked options pulled from live venue and event data.

Built as an MLOps class project. See [INFRASTRUCTURE.md](INFRASTRUCTURE.md) for the full system design, GCP stack, and cost justification.

---

## Current state — Week 2 complete

- System design doc ([INFRASTRUCTURE.md](INFRASTRUCTURE.md))
- **Decision Engine** FastAPI service: `/health`, `/recommend`, `/feedback` ([decision_engine.py](decision_engine.py))
- **BigQuery** venue and event retrieval layer ([recommendation_bigquery.py](recommendation_bigquery.py))
- **Supabase** user and feedback logging ([db.py](db.py))
- **Data scraping** pipelines for Google Places and Ticketmaster ([Data_scraping /README.md](Data_scraping%20/README.md))
- **Browser demo UI** for live testing ([demo/README.md](demo/README.md))
- **CI** with pytest, ruff lint, and ruff format check ([.github/workflows/ci.yml](.github/workflows/ci.yml))
- **Unit tests** for scoring + preference merging + price-level normalization (20 passing)

What's coming next (Week 3+): Google Calendar FreeBusy integration, XGBoost learning-to-rank (v1 model) trained on logged feedback, Cloud Run deployment, drift monitoring.

---

## Repo layout

| Path | Purpose |
|------|---------|
| [decision_engine.py](decision_engine.py) | FastAPI service — group preference merging, venue scoring, recommendation + feedback endpoints |
| [recommendation_bigquery.py](recommendation_bigquery.py) | BigQuery helpers for fetching venues and events |
| [db.py](db.py) | Supabase (Postgres) layer for users, recommendation logs, and feedback |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | System design, GCP stack, cost estimate, ML model strategy |
| [Data_scraping /](Data_scraping%20/) | Google Places + Ticketmaster → BigQuery pipelines |
| [demo/](demo/) | Standalone browser UI that calls `/recommend` |
| [tests/](tests/) | Unit tests (no creds) + BigQuery integration tests (opt-in) |
| [FastAPI/](FastAPI/) | Week 1 wine-classifier exercise (legacy, kept for reference) |
| [.github/workflows/ci.yml](.github/workflows/ci.yml) | GitHub Actions — lint + test on every PR |
| [pyproject.toml](pyproject.toml) | Ruff config (linter + formatter) |
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
# Edit .env: fill in GCP_PROJECT, DATABASE_URL, MLFLOW_TRACKING_URI
gcloud auth application-default login    # for BigQuery

# 3. Run the API
uvicorn decision_engine:app --reload --port 8080
curl http://127.0.0.1:8080/health

# 4. (Optional) Run the browser demo UI
python3 -m http.server 5500
# open http://127.0.0.1:5500/demo/demo.html
```

If `/recommend` returns 503 with a BigQuery error, you skipped `gcloud auth application-default login` — the API can't read from BigQuery without it.

---

## Testing

```bash
# Unit tests (no creds needed) — runs on every PR in CI
pytest tests/ -v --ignore=tests/test_bigquery_integration.py

# BigQuery integration tests (opt-in, needs ADC)
RUN_BQ_INTEGRATION=1 pytest tests/test_bigquery_integration.py -v

# Lint
ruff check .

# Format check
ruff format --check .
```

CI runs lint + unit tests automatically on every push and pull request. BigQuery integration tests are intentionally skipped in CI because they require live GCP credentials.

---

## Architecture

Three-layer: **Frontend** (React, browser) → **API** (FastAPI Decision Engine on Cloud Run) → **Data** (BigQuery venues/events + Supabase users/feedback + MLflow model registry). Full diagram and per-component justification in [INFRASTRUCTURE.md](INFRASTRUCTURE.md).

---

## Contributing

- Create feature branches off `main` (e.g. `yourname/feature-name`)
- Install the pre-commit hook: `pre-commit install` — every commit auto-runs ruff
- Open a PR against `main`. CI must pass (lint + tests) before merging
- Keep PR titles in conventional-commit style: `feat:`, `fix:`, `chore:`, `docs:`, `style:`, `test:`

---

## Team

- **Patrick** — infrastructure design, system architecture, GCP stack
- **Sai** — Decision Engine, BigQuery integration, CI + tests, demo UI
- **[Teammate 3]** — data scraping pipelines
- **[Teammate 4]** — [TBD]

Fill in real contributions before the Week 2 slide deck.
