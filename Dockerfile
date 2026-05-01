# Plot Decision Engine — Cloud Run service.
#
# Single image used by the plot-decision-engine Cloud Run *service*. Cloud
# Run injects PORT at runtime (default 8080) and the service must listen
# on it; we pass it through to uvicorn.
#
# Build:  gcloud builds submit --tag us-central1-docker.pkg.dev/<project>/plot/api:latest .
# Run:    docker run -p 8080:8080 -e OPENAI_API_KEY=... -e DATABASE_URL=... <image>

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080

WORKDIR /app

# Minimal system deps for psycopg2-binary + grpc / google-cloud-bigquery.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt

# Copy only what the API needs — keep the image small and avoid baking any
# training data, notebooks, .env, or local secrets.
COPY decision_engine.py llm_rerank.py llm_intent.py \
     recommendation_bigquery.py db.py ./
COPY prompts/ prompts/

EXPOSE 8080

# uvicorn binds 0.0.0.0 so Cloud Run can reach it. PORT is dynamic.
CMD ["sh", "-c", "uvicorn decision_engine:app --host 0.0.0.0 --port ${PORT}"]
