# Plot — Infrastructure Design

Technical decisions, cost justifications, and architecture rationale for the Plot date/hangout planning platform.

---

## Architecture Overview

Plot follows a three-layer architecture: **Frontend** (React, runs in the browser), **API Layer** (FastAPI Decision Engine on Cloud Run), and **Data Layer** (BigQuery, Cloud SQL, GCS). All backend services run on Google Cloud Platform.

```
User ──► React Frontend (browser)
              │
              ▼  HTTPS
         FastAPI Decision Engine (Cloud Run)
           ├── Google Calendar FreeBusy API
           ├── BigQuery (venues + events)
           ├── Cloud SQL (users + preferences)
           ├── MLflow (model registry)
           └── Evidently AI (monitoring)
```

---

## Component Decisions

### 1. FastAPI — Decision Engine & Model Serving

**Choice:** FastAPI in a Docker container on Cloud Run

**Why not alternatives:**

| Alternative | Why we didn't choose it |
|-------------|------------------------|
| Flask | No async support, no automatic request validation, no auto-generated API docs. FastAPI is strictly better for this use case. |
| Django | Full web framework with ORM, admin panel, templating — heavy machinery we don't need for an API service. |
| Vertex AI Endpoints | Would require deploying the model separately, adding a network hop per prediction (~50-200ms latency) and $41-56/month even at zero traffic. Our XGBoost model runs in microseconds in-process. |
| MLflow Serving | Generic `/invocations` endpoint with no customization. Our Decision Engine needs business logic (calendar checks, preference merging, BigQuery queries) wrapped around model inference — not just a model endpoint. |

**Why FastAPI specifically:**
- Our Decision Engine isn't just model serving. It orchestrates 6 steps per request: authenticate, check calendar availability, merge group preferences, query BigQuery for candidates, score with the ML model, compose plan options. FastAPI lets us do all of this in one service.
- Pydantic integration gives us request/response validation for free.
- Auto-generated Swagger docs at `/docs` for testing during development.
- Async support for calling external APIs (Calendar, BigQuery) without blocking.

---

### 2. Google Cloud Run — Compute

**Choice:** Cloud Run (serverless containers)

**Why not alternatives:**

| Alternative | Monthly Cost (our scale) | Why we didn't choose it |
|-------------|--------------------------|------------------------|
| Cloud Run | ~$0-5 | Scales to zero — no cost when idle. Pay only per request. |
| Compute Engine VM | ~$7-25 | Always-on, paying 24/7 even when nobody is using the app. Manual scaling, manual updates. |
| GKE (Kubernetes) | ~$70+ | Minimum $70/month for the control plane alone. Massive overkill for a single-service class project. |
| App Engine | ~$0-10 | Viable, but less control over the container. Cloud Run is the modern replacement. |

**Key cost consideration:** Cloud Run scales to zero. During a class project, the app will be idle >99% of the time. With Cloud Run, idle time costs $0. A Compute Engine VM or GKE cluster would run 24/7 regardless of traffic.

**Consistency with existing work:** The team already has Docker experience from the wine classifier assignment (see `FastAPI/Dockerfile`). Cloud Run deploys Docker containers directly — same workflow, no new tooling.

---

### 3. BigQuery — Venues & Events Data Warehouse

**Choice:** BigQuery for venue and event data

**Current tables:**
- `mlops-project-491402.places_raw.venues` — ~20 columns, scraped from Google Places API
- `mlops-project-491402.places_raw.events` — ~27 columns, scraped from Ticketmaster API

**Why BigQuery:**
- Already built and populated — both scraping pipelines write here today.
- 1 TB/month of free queries, 10 GB free storage. Our dataset is small enough to stay well within free tier.
- SQL interface makes it easy to filter candidates (e.g., `WHERE category = 'Food & Drink' AND price_level IN (...) AND distance_km < 5`).
- Columnar storage is efficient for analytical queries over many rows with few columns (which is exactly what the Decision Engine does — scan venues, filter, return features for scoring).

**Why not Firestore or Cloud SQL for this data:**
- Venue/event data is read-heavy, append-only, and analytical in nature. BigQuery is designed for this pattern.
- Firestore is optimized for real-time document lookups, not scanning and filtering 10,000+ venues.
- Cloud SQL could work but lacks BigQuery's free tier generosity and columnar performance.

---

### 4. Cloud SQL (PostgreSQL) — Users & Preferences

**Choice:** Cloud SQL (Postgres) for user accounts, preferences, hangout history, and feedback

**Why not BigQuery for this data:**
- User data is transactional: frequent reads and writes, small row updates (e.g., changing a preference). BigQuery is optimized for large analytical scans, not single-row lookups.
- User operations need low-latency point queries (e.g., "get user X's preferences"). Cloud SQL with proper indexing returns these in <5ms. BigQuery would take seconds.

**Why not Firestore:**
- Firestore's flexible schema is appealing, but our user data has a well-defined relational structure: users have preferences, users create hangouts, hangouts have participants, participants give feedback. Postgres handles relational data with joins naturally.
- Firestore costs scale per read/write operation. For our use case (frequent reads of user preferences on every recommendation request), Postgres on a small instance is more predictable.

**Cost:** Cloud SQL `db-f1-micro` instance is ~$7-10/month, or free during the GCP free trial.

---

### 5. MLflow — Experiment Tracking & Model Registry

**Choice:** Self-hosted MLflow on Cloud Run (backed by Cloud SQL for metadata + GCS for artifacts)

**Why MLflow:**
- Versioned model registry: we register v0 (weighted scoring function) and later v1 (trained XGBoost ranker). The Decision Engine loads the production model via `mlflow.pyfunc.load_model("models:/plot-ranker/Production")`.
- Experiment tracking: when training the GBT model, we log hyperparameters, metrics (precision, recall, NDCG), and the model artifact. This lets us compare runs and pick the best one.
- Consistent with class curriculum — the wine classifier assignment already uses MLflow.

**Why not Vertex AI Model Registry:**
- Vertex AI Model Registry is free to store models, but deploying them requires a Vertex AI Endpoint ($41-56/month minimum, cannot scale to zero). We load models directly in FastAPI instead.

**Why not Weights & Biases / Neptune:**
- Paid SaaS tools. MLflow is open-source, self-hosted, and sufficient for our needs.

**Cost:** MLflow runs as a Cloud Run service (scales to zero, ~$0-2/month). Artifact storage on GCS is ~$0.02/month for our model files.

---

### 6. Evidently AI — Model Monitoring

**Choice:** Evidently AI (open-source Python library)

**What it monitors:**
- **Data drift:** Has the distribution of venue/event features changed since the model was trained? (e.g., new types of venues appearing, price ranges shifting)
- **Prediction drift:** Are the model's recommendation scores trending differently over time?
- **Model quality:** When we have feedback labels (user accepted/rejected a recommendation), track accuracy metrics.

**Why Evidently AI:**

| Alternative | Cost | Why we chose Evidently instead |
|-------------|------|-------------------------------|
| Evidently AI | Free (open-source) | Python library, generates HTML reports, integrates with MLflow and FastAPI. |
| Vertex AI Model Monitoring | $3.50/GB analyzed + requires Vertex Endpoint ($41-56/mo) | Only works with models deployed on Vertex AI Endpoints. We serve models directly in FastAPI. |
| Arize AI | Paid SaaS (~$500+/mo) | Enterprise tool. Overkill for a class project. |
| NannyML | Free (open-source) | Interesting for delayed feedback scenarios, but Evidently covers our core needs and has a larger ecosystem. |
| Custom (DIY) | Free but time-intensive | Writing drift detection from scratch wastes time we could spend on the product. |

**Cost:** $0. Evidently runs as part of our FastAPI service or as a periodic Cloud Run job.

---

### 7. GitHub Actions — CI/CD

**Choice:** GitHub Actions for automated build, test, and deploy

**What it does:**
1. On push to `main`: build Docker image, push to Google Artifact Registry, deploy to Cloud Run.
2. Eliminates manual deployment (currently the team `gcloud compute scp`s files to a VM by hand).

**Why not alternatives:**
- **Cloud Build:** GCP-native, but GitHub Actions is free for public repos and more familiar to the team.
- **Jenkins:** Self-hosted CI server. Requires a running VM — adds cost and maintenance for no benefit.
- **Manual deploys:** Error-prone, not reproducible, and doesn't scale as the team grows.

**Cost:** Free for public repositories. 2,000 minutes/month free for private repos.

---

### 8. Google Calendar FreeBusy API — Availability

**Choice:** Google Calendar FreeBusy API for finding mutual free time

**What it does:** Takes a list of calendar IDs and a time range, returns busy blocks for each person. We invert these to find free windows, then intersect across all participants.

**Why FreeBusy specifically (not full Calendar API):**
- Only requires `calendar.freebusy` OAuth scope — users don't have to share event details (titles, descriptions, attendees). Privacy-friendly.
- Returns just start/end times of busy blocks. Less data to process, simpler logic.
- The full Calendar Events API would give us event details we don't need and requires broader permissions that users may be reluctant to grant.

**Cost:** Free (included in Google Calendar API quota — 1,000,000 queries/day).

---

### 9. Data Sources — Google Places API & Ticketmaster API

**Choice:** Google Places API (New) + Ticketmaster Discovery API for venue and event data

**Google Places API:**
- Text Search endpoint with a 3x3 grid covering SF (9 cells, 2.5 km radius each)
- 15 default search queries x 9 grid cells = 135 search combinations per run
- Dedup by `place_id + date` for a living dataset that tracks changes over time
- Cost: ~$32 per 1,000 Text Search requests. Our daily runs use ~400 requests = ~$13/day if running daily. During development, runs are manual and infrequent.

**Ticketmaster Discovery API:**
- 30-mile radius around SF center, paginated up to 1,000 events per run
- Naturally a living dataset — events change, get cancelled, sell out
- Cost: Free (5,000 requests/day, no credit card required)

---

## ML Model Strategy

### Phase 1: Weighted Scoring Function (v0)

A hand-crafted formula registered in MLflow as the initial "model":

```
score = 0.25 * rating_normalized
      + 0.25 * preference_match
      + 0.20 * price_match
      + 0.15 * distance_score
      + 0.15 * time_fit
```

This bootstraps the recommendation engine with zero training data. Every recommendation served is logged with the candidate features and user response (accepted/rejected/skipped).

### Phase 2: Gradient Boosted Trees (v1)

Once sufficient user interaction data exists, train an XGBoost ranking model:

- **Features:** rating, price level, category match, distance, time overlap, group budget fit, user history
- **Labels:** 1 (user accepted) / 0 (user skipped or rejected)
- **Why XGBoost over alternatives:**

| Model | Why not |
|-------|---------|
| Logistic regression | Can't capture non-linear interactions (e.g., "cheap + far = bad, cheap + close = great") |
| Random forest | GBTs consistently outperform on the same tabular data |
| Neural network | Overkill for structured tabular data, needs far more training data, harder to serve, slower inference, less interpretable |
| Collaborative filtering | Requires a large user base with overlapping behavior — we won't have that early on |
| LLM-based ranking | Expensive per-request, slow, non-deterministic |

- **Why GBTs are right here:** Tabular data is their sweet spot. They handle mixed numeric/categorical features natively, work well with small datasets (hundreds of rows), train in seconds, and inference takes microseconds (no GPU needed). Feature importances are directly extractable for explainability.

### MLflow Lifecycle

```
v0 (weighted scoring) ──registered──► MLflow Registry (Production)
        │
        ├── serves recommendations
        ├── logs user interactions to Cloud SQL
        │
        ▼  (enough feedback data collected)
v1 (XGBoost ranker) ──trained──► MLflow Registry (Staging)
        │
        ├── compare metrics against v0
        ├── if better: promote to Production
        └── Evidently AI monitors for drift
```

---

## Cost Summary

| Component | GCP Service | Monthly Cost | Notes |
|-----------|-------------|-------------|-------|
| API / Decision Engine | Cloud Run | ~$0-5 | Scales to zero; free at low traffic |
| Venue + event data | BigQuery | ~$0 | Free tier: 1 TB queries, 10 GB storage |
| User data | Cloud SQL (Postgres) | ~$7-10 | db-f1-micro instance |
| MLflow server | Cloud Run | ~$0-2 | Scales to zero |
| MLflow artifacts | Cloud Storage (GCS) | ~$0.02 | A few model files |
| Container images | Artifact Registry | ~$0.10 | Storage for Docker images |
| Secrets | Secret Manager | ~$0 | Free tier covers our usage |
| CI/CD | GitHub Actions | $0 | Free for public repos |
| Model monitoring | Evidently AI | $0 | Open-source, runs in our service |
| Scheduling | Cloud Scheduler | $0 | 3 free jobs/month |
| Calendar API | Google Calendar API | $0 | Free quota |
| Event data | Ticketmaster API | $0 | Free tier (5,000 req/day) |
| Venue data | Google Places API | ~$0-13/day | Only when scraping runs |
| **Total** | | **~$10-25/month** | **Excluding Places API scraping** |

### Why this is 3-10x cheaper than alternatives

- **Cloud Run vs. GKE:** GKE control plane alone is $70/month. Cloud Run is $0 when idle.
- **Cloud Run vs. always-on VMs:** A single `e2-small` VM is ~$13/month running 24/7. We'd need at least 2 (API + MLflow). Cloud Run charges only for actual request time.
- **In-process model serving vs. Vertex AI Endpoints:** Vertex AI Endpoints are $41-56/month minimum (cannot scale to zero). Loading the model directly in FastAPI costs $0 extra.
- **Evidently vs. Vertex AI Model Monitoring:** Vertex charges $3.50/GB analyzed and requires a Vertex Endpoint. Evidently is free.

---

## Consistency Considerations

### Why everything runs on GCP

All services are on Google Cloud Platform for three reasons:

1. **Network latency:** Cloud Run → BigQuery, Cloud Run → Cloud SQL, and Cloud Run → GCS calls stay within Google's internal network. No public internet hops. This keeps Decision Engine response times low.

2. **IAM and authentication:** A single service account with scoped roles covers all services. No cross-cloud credential management. The FastAPI container on Cloud Run automatically picks up its service account — no API keys for internal GCP services.

3. **Billing and quotas:** One GCP project (`mlops-project-491402`), one billing account, one dashboard for cost tracking. No need to reconcile bills across AWS, GCP, and third-party SaaS.

### Why Docker everywhere

Every deployable component (FastAPI Decision Engine, MLflow server) is a Docker container. This gives us:

- **Environment consistency:** The same image that passes CI runs in production. No "works on my machine" issues.
- **Portable deploys:** Cloud Run deploys container images directly. If we ever move off Cloud Run, the same images run on any container platform (GKE, ECS, a bare VM with Docker).
- **Reproducible builds:** `Dockerfile` + `requirements.txt` fully defines the runtime. Anyone on the team can build and run locally.

### Why BigQuery + Cloud SQL (not one or the other)

We use two databases because venue data and user data have opposite access patterns:

| | BigQuery (venues/events) | Cloud SQL (users/preferences) |
|---|---|---|
| Access pattern | Scan thousands of rows, filter, aggregate | Point lookups, single-row updates |
| Write pattern | Bulk append (daily scraping jobs) | Frequent small writes (user actions) |
| Query latency | Seconds (acceptable for batch filtering) | Milliseconds (needed for real-time requests) |
| Scaling | Serverless, auto-scales | Fixed instance, vertical scaling |

Using BigQuery for user data would be slow and expensive (per-query pricing on frequent small reads). Using Cloud SQL for venue data would require managing indexes and storage for a growing analytical dataset that BigQuery handles effortlessly.

### API consistency

All external communication uses REST over HTTPS:
- Frontend → FastAPI: REST API with JSON request/response
- FastAPI → Google Calendar: REST API
- FastAPI → BigQuery: Google Cloud client library (gRPC internally, but abstracted)
- FastAPI → MLflow: Python SDK (in-process model loading, no network call)

No GraphQL, no gRPC on the public surface, no WebSockets. One protocol, one pattern, simpler debugging.
