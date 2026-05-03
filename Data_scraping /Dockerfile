# Single image used by two Cloud Run jobs: plot-scrape-events and
# plot-scrape-places. The job definition picks which script to run by
# overriding `args` (see scripts/setup_cloud_run_jobs.sh).
#
# Build:  gcloud builds submit --tag us-central1-docker.pkg.dev/<project>/plot/scraper:latest .
# Run:    docker run --rm -e GCP_PROJECT=... -e TICKETMASTER_API_KEY=... <image> python events_to_bq.py

FROM python:3.11-slim

# Faster, cleaner pip in CI; no .pyc clutter at runtime.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install system deps required by google-cloud-bigquery (libffi for grpc, ca-certs).
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy only the scraper scripts — keep the image small.
COPY events_to_bq.py places_to_bq.py ./

# Cloud Run jobs override `args` per job. Default to events so you can
# run the image bare for smoke tests: `docker run <image>`.
CMD ["python", "events_to_bq.py"]
