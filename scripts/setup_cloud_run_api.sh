#!/usr/bin/env bash
#
# Provision the FastAPI Decision Engine as a Cloud Run *service*.
# Idempotent — re-run after code changes to roll out a new revision.
#
# Why a service (not a job): the API needs to be online to serve HTTP
# requests from the demo UI / users' browsers. Scales to zero when idle,
# only billed per request.
#
# Required env vars (export before running, or paste inline):
#   OPENAI_API_KEY
#   DATABASE_URL          (Supabase Session Pooler URL)
#
# Optional env vars (sensible defaults applied):
#   GCP_PROJECT           (default: mlops-project-491402)
#   REGION                (default: us-central1)

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT="${GCP_PROJECT:-mlops-project-491402}"
REGION="${REGION:-us-central1}"
REPO="plot"                                                # shared with scraper
IMAGE="api"                                                # API-specific image
SA="plot-scraper@${PROJECT}.iam.gserviceaccount.com"       # reuses scraper SA
SERVICE="plot-decision-engine"

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${IMAGE}:latest"

# ---------------------------------------------------------------------------
# Sanity checks
# ---------------------------------------------------------------------------
: "${OPENAI_API_KEY:?Set OPENAI_API_KEY before running (sourced from .env)}"
: "${DATABASE_URL:?Set DATABASE_URL before running (sourced from .env)}"

CURRENT_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$CURRENT_PROJECT" != "$PROJECT" ]]; then
  echo "Active gcloud project is '$CURRENT_PROJECT', not '$PROJECT'."
  echo "Run: gcloud config set project $PROJECT"
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Enable APIs (idempotent)
# ---------------------------------------------------------------------------
echo ">>> Enabling required APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  --project="$PROJECT"

# ---------------------------------------------------------------------------
# 2. Ensure Artifact Registry repo (already exists if you deployed scrapers)
# ---------------------------------------------------------------------------
echo ">>> Ensuring Artifact Registry repo '$REPO' exists..."
if ! gcloud artifacts repositories describe "$REPO" \
       --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --project="$PROJECT" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Plot container images"
fi

# ---------------------------------------------------------------------------
# 3. Build + push the API image with Cloud Build (no local Docker needed)
# ---------------------------------------------------------------------------
echo ">>> Building image $IMAGE_URI via Cloud Build..."
gcloud builds submit \
  --project="$PROJECT" \
  --tag="$IMAGE_URI" \
  .

# ---------------------------------------------------------------------------
# 4. Deploy / update the Cloud Run service
# ---------------------------------------------------------------------------
# Env vars include secrets. Cloud Run encrypts at rest. For tighter prod
# hygiene, migrate to Secret Manager. Using `^|^` prefix as the delimiter
# so DATABASE_URL (which can contain `=`, `@`, `:`) doesn't get re-parsed.
ENV_STRING="^|^GCP_PROJECT=${PROJECT}"
ENV_STRING+="|BQ_DATASET=places_raw"
ENV_STRING+="|BQ_TABLE=venues"
ENV_STRING+="|BQ_EVENTS_TABLE=events"
ENV_STRING+="|OPENAI_API_KEY=${OPENAI_API_KEY}"
ENV_STRING+="|DATABASE_URL=${DATABASE_URL}"

echo ">>> Deploying $SERVICE..."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --image="$IMAGE_URI" \
  --service-account="$SA" \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=512Mi \
  --concurrency=80 \
  --timeout=30s \
  --max-instances=50 \
  --min-instances=1 \
  --port=8080 \
  --set-env-vars="$ENV_STRING"

URL="$(gcloud run services describe "$SERVICE" \
        --project="$PROJECT" --region="$REGION" \
        --format='value(status.url)')"

# ---------------------------------------------------------------------------
# 5. Summary
# ---------------------------------------------------------------------------
cat <<EOF

Deployed.

Public URL: $URL

Smoke tests:
  curl -s $URL/health
  curl -s $URL/

Sample /recommend call (proves end-to-end works):
  curl -s -X POST $URL/recommend \\
    -H 'Content-Type: application/json' \\
    -d '{
      "users": [{"user_id":"u1","budget":"medium","categories":["Food & Drink"],"max_distance_km":5}],
      "top_k": 3
    }' | head -50

To stop / cancel without deleting:
  gcloud run services update $SERVICE --region=$REGION --max-instances=0

To re-enable:
  gcloud run services update $SERVICE --region=$REGION --max-instances=5

To delete entirely:
  gcloud run services delete $SERVICE --region=$REGION --quiet

To redeploy after code changes — just re-run this script.
EOF
