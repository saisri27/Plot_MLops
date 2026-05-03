#!/usr/bin/env bash
#
# Provision the Cloud Run jobs + Cloud Scheduler entries that scrape
# Ticketmaster events (2x/week) and Google Places (2x/month) into BigQuery.
#
# Why Cloud Run jobs instead of GitHub Actions: uses your GCP credits,
# everything lives in one cloud, and Cloud Run jobs are billed only for the
# ~5 min the scraper actually runs (no idle VM cost).
#
# Why Cloud Run jobs instead of an always-on GCE VM: a VM costs $7-25/month
# even idle. Two Cloud Run jobs that run a combined ~10 times/month cost
# pennies and need zero patching.
#
# Idempotent: re-running the script updates existing jobs/schedulers in place.
#
# Prereqs:
#   - gcloud CLI installed and logged in (`gcloud auth login`)
#   - Active project set to mlops-project-491402 (`gcloud config set project ...`)
#   - The plot-scraper service account already created with BigQuery roles.
#     The README walks through that. If you haven't, run:
#       gcloud iam service-accounts create plot-scraper --display-name="Plot scraper"
#       gcloud projects add-iam-policy-binding $PROJECT \
#         --member="serviceAccount:plot-scraper@$PROJECT.iam.gserviceaccount.com" \
#         --role="roles/bigquery.dataEditor"
#       gcloud projects add-iam-policy-binding $PROJECT \
#         --member="serviceAccount:plot-scraper@$PROJECT.iam.gserviceaccount.com" \
#         --role="roles/bigquery.jobUser"
#
# Required env vars (export before running, or paste inline):
#   TICKETMASTER_API_KEY
#   GOOGLE_PLACES_API_KEY

set -euo pipefail

# ---------------------------------------------------------------------------
# Config — change these only if you know why
# ---------------------------------------------------------------------------
PROJECT="${GCP_PROJECT:-mlops-project-491402}"
REGION="${REGION:-us-central1}"                         # Cloud Run + Scheduler region
REPO="plot"                                             # Artifact Registry repo name
IMAGE="scraper"                                         # image name in the repo
SA="plot-scraper@${PROJECT}.iam.gserviceaccount.com"    # runtime + scheduler identity
SCRAPER_DIR="Data_scraping "                            # NB: trailing space matches dir name

EVENTS_JOB="plot-scrape-events"
PLACES_JOB="plot-scrape-places"
EVENTS_SCHED="plot-scrape-events-cron"
PLACES_SCHED="plot-scrape-places-cron"

# Cron expressions — interpreted in the scheduler's --time-zone (UTC by default).
# 13:00 UTC ~= 6am SF year-round (DST shifts the clock-time by an hour, fine).
EVENTS_CRON="0 13 * * 2,5"        # Tue & Fri = 2x/week
PLACES_CRON="0 13 1,15 * *"       # 1st & 15th = 2x/month

# ---------------------------------------------------------------------------
# Sanity checks before we start charging your credits
# ---------------------------------------------------------------------------
: "${TICKETMASTER_API_KEY:?Set TICKETMASTER_API_KEY before running}"
: "${GOOGLE_PLACES_API_KEY:?Set GOOGLE_PLACES_API_KEY before running}"

CURRENT_PROJECT="$(gcloud config get-value project 2>/dev/null || true)"
if [[ "$CURRENT_PROJECT" != "$PROJECT" ]]; then
  echo "Active gcloud project is '$CURRENT_PROJECT', not '$PROJECT'."
  echo "Run: gcloud config set project $PROJECT"
  exit 1
fi

# ---------------------------------------------------------------------------
# 1. Enable the APIs we'll use (no-op if already enabled)
# ---------------------------------------------------------------------------
echo ">>> Enabling required APIs..."
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  cloudscheduler.googleapis.com \
  --project="$PROJECT"

# ---------------------------------------------------------------------------
# 2. Create Artifact Registry repo (if it doesn't exist)
# ---------------------------------------------------------------------------
echo ">>> Ensuring Artifact Registry repo '$REPO' exists in $REGION..."
if ! gcloud artifacts repositories describe "$REPO" \
       --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$REPO" \
    --project="$PROJECT" \
    --location="$REGION" \
    --repository-format=docker \
    --description="Plot container images"
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT}/${REPO}/${IMAGE}:latest"

# ---------------------------------------------------------------------------
# 3. Build + push the scraper image with Cloud Build (no local Docker needed)
# ---------------------------------------------------------------------------
echo ">>> Building image $IMAGE_URI from $SCRAPER_DIR via Cloud Build..."
gcloud builds submit "$SCRAPER_DIR" \
  --project="$PROJECT" \
  --tag="$IMAGE_URI"

# ---------------------------------------------------------------------------
# 4. Grant the scheduler permission to invoke Cloud Run jobs
# ---------------------------------------------------------------------------
echo ">>> Granting roles/run.invoker to the scraper service account..."
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$SA" \
  --role="roles/run.invoker" \
  --condition=None >/dev/null

# ---------------------------------------------------------------------------
# 5. Create or update the two Cloud Run jobs
# ---------------------------------------------------------------------------
upsert_job() {
  local name="$1"
  local entrypoint="$2"   # python events_to_bq.py | python places_to_bq.py
  local extra_env="$3"    # extra env-var string to append, can be empty

  local common_env="GCP_PROJECT=$PROJECT,BQ_DATASET=places_raw"
  local env_string="${common_env}${extra_env:+,$extra_env}"

  local args
  IFS=' ' read -r -a args <<<"$entrypoint"

  if gcloud run jobs describe "$name" \
       --project="$PROJECT" --region="$REGION" >/dev/null 2>&1; then
    echo ">>> Updating job $name..."
    gcloud run jobs update "$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --image="$IMAGE_URI" \
      --service-account="$SA" \
      --max-retries=1 \
      --task-timeout=1800s \
      --cpu=1 \
      --memory=512Mi \
      --command="${args[0]}" \
      --args="${args[1]}" \
      --set-env-vars="$env_string"
  else
    echo ">>> Creating job $name..."
    gcloud run jobs create "$name" \
      --project="$PROJECT" \
      --region="$REGION" \
      --image="$IMAGE_URI" \
      --service-account="$SA" \
      --max-retries=1 \
      --task-timeout=1800s \
      --cpu=1 \
      --memory=512Mi \
      --command="${args[0]}" \
      --args="${args[1]}" \
      --set-env-vars="$env_string"
  fi
}

upsert_job "$EVENTS_JOB" "python events_to_bq.py" \
  "BQ_EVENTS_TABLE=events,TICKETMASTER_API_KEY=$TICKETMASTER_API_KEY"

upsert_job "$PLACES_JOB" "python places_to_bq.py" \
  "BQ_TABLE=venues,GOOGLE_PLACES_API_KEY=$GOOGLE_PLACES_API_KEY"

# ---------------------------------------------------------------------------
# 6. Create or update the two Cloud Scheduler entries that trigger the jobs
# ---------------------------------------------------------------------------
upsert_scheduler() {
  local name="$1"
  local job="$2"
  local cron="$3"

  local uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${job}:run"

  if gcloud scheduler jobs describe "$name" \
       --project="$PROJECT" --location="$REGION" >/dev/null 2>&1; then
    echo ">>> Updating scheduler $name ($cron) -> $job..."
    gcloud scheduler jobs update http "$name" \
      --project="$PROJECT" \
      --location="$REGION" \
      --schedule="$cron" \
      --time-zone="UTC" \
      --uri="$uri" \
      --http-method=POST \
      --oauth-service-account-email="$SA"
  else
    echo ">>> Creating scheduler $name ($cron) -> $job..."
    gcloud scheduler jobs create http "$name" \
      --project="$PROJECT" \
      --location="$REGION" \
      --schedule="$cron" \
      --time-zone="UTC" \
      --uri="$uri" \
      --http-method=POST \
      --oauth-service-account-email="$SA"
  fi
}

upsert_scheduler "$EVENTS_SCHED" "$EVENTS_JOB" "$EVENTS_CRON"
upsert_scheduler "$PLACES_SCHED" "$PLACES_JOB" "$PLACES_CRON"

# ---------------------------------------------------------------------------
# 7. Summary
# ---------------------------------------------------------------------------
cat <<EOF

Setup complete.

Cloud Run jobs:
  $EVENTS_JOB  ($EVENTS_CRON UTC, ~5 min/run)
  $PLACES_JOB  ($PLACES_CRON UTC, ~15 min/run, ~\$13/run in Places API)

Manual trigger to verify (recommended for events first):
  gcloud run jobs execute $EVENTS_JOB --project=$PROJECT --region=$REGION --wait

After it finishes, sanity check the table:
  bq query --use_legacy_sql=false 'SELECT MAX(fetched_at), COUNT(*) FROM \`$PROJECT.places_raw.events\`'

To tear down everything later:
  gcloud scheduler jobs delete $EVENTS_SCHED --location=$REGION --quiet
  gcloud scheduler jobs delete $PLACES_SCHED --location=$REGION --quiet
  gcloud run jobs delete $EVENTS_JOB --region=$REGION --quiet
  gcloud run jobs delete $PLACES_JOB --region=$REGION --quiet
EOF
