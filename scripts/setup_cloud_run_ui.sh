#!/usr/bin/env bash
#
# Provision the Plot UI as a Cloud Run service. Idempotent — re-run after
# any UI/ change to roll out a new revision; the URL stays the same.
#
# Optional env vars:
#   GCP_PROJECT  (default: mlops-project-491402)
#   REGION       (default: us-central1)

set -euo pipefail

PROJECT="${GCP_PROJECT:-mlops-project-491402}"
REGION="${REGION:-us-central1}"
REPO="plot"
IMAGE="ui"
SERVICE="plot-ui"
SA="plot-scraper@${PROJECT}.iam.gserviceaccount.com"

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${IMAGE}:latest"

CURRENT_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$CURRENT_PROJECT" != "$PROJECT" ]]; then
  echo "Active gcloud project is '$CURRENT_PROJECT', not '$PROJECT'."
  exit 1
fi

echo ">>> Enabling required APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  --project="$PROJECT"

echo ">>> Building UI image $IMAGE_URI via Cloud Build..."
gcloud builds submit \
  --project="$PROJECT" \
  --tag="$IMAGE_URI" \
  UI

echo ">>> Deploying $SERVICE..."
gcloud run deploy "$SERVICE" \
  --project="$PROJECT" \
  --region="$REGION" \
  --image="$IMAGE_URI" \
  --service-account="$SA" \
  --allow-unauthenticated \
  --cpu=1 \
  --memory=256Mi \
  --concurrency=200 \
  --timeout=15s \
  --max-instances=3 \
  --min-instances=0 \
  --port=8080

URL="$(gcloud run services describe "$SERVICE" \
        --project="$PROJECT" --region="$REGION" \
        --format='value(status.url)')"

cat <<EOF

UI deployed.

Public URL: $URL/Plot.html

Open it on any phone or laptop. CORS is permissive on the API, so the
prototype's fetch() calls will reach your live Decision Engine at:
  https://plot-decision-engine-773940296505.us-central1.run.app

Redeploy after UI changes:
  bash scripts/setup_cloud_run_ui.sh
EOF
