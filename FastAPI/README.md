# Wine Quality Classifier API

A FastAPI web service that serves predictions from an MLflow-registered Decision Tree model trained on the sklearn wine dataset.

## Project Structure

```
├── app.py              # FastAPI application with /predict, /health, / endpoints
├── Dockerfile          # Container building layers
├── requirements.txt    # Required  dependencies
└── README.md           # How to run it 
```

## Endpoints

All endpoints are defined in [`app.py`](app.py).

| Method | Endpoint   | Description                          |
|--------|-----------|--------------------------------------|
| GET    | `/`        | Welcome message                      |
| GET    | `/health`  | Confirms the model is loaded         |
| POST   | `/predict` | Accepts wine features, returns class |

## Docker Image

**Docker Hub:** `maddiralasai/wine-classifier-api:latest`

## Run Instructions

### Option 1: Run locally (without Docker)

```bash
# Install dependencies
pip install -r requirements.txt

# Update the tracking URI in app.py to point to your local mlflow.db:
#   mlflow.set_tracking_uri("sqlite:///mlflow.db")

# Start the API server
uvicorn app:app --host 0.0.0.0 --port 8000
```

### Option 2: Build and run with Docker

```bash
# Build the image
docker build -t wine-classifier-api .

# Run with the MLflow data volume mounted
docker run -d -p 8000:8000 -v mlflow-data:/mlflow-data --name wine-api wine-classifier-api
```

The MLflow data (`mlflow.db` and `mlruns/`) is stored in a Docker volume called `mlflow-data`, which is mounted at `/mlflow-data` inside the container.

### Option 3: Pull from Docker Hub and run

```bash
docker pull maddiralasai/wine-classifier-api:latest
docker run -d -p 8000:8000 -v mlflow-data:/mlflow-data --name wine-api maddiralasai/wine-classifier-api:latest
```

## Example `/predict` Request

**Input:**

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "alcohol": 13.0,
    "malic_acid": 1.5,
    "ash": 2.3,
    "alcalinity_of_ash": 15.0,
    "magnesium": 120.0,
    "total_phenols": 2.8,
    "flavanoids": 3.0,
    "nonflavanoid_phenols": 0.28,
    "proanthocyanins": 2.29,
    "color_intensity": 5.64,
    "hue": 1.04,
    "od280/od315_of_diluted_wines": 3.92,
    "proline": 1065.0
  }'
```

**Expected Output:**

```json
{
  "prediction": 0,
  "class_name": "class_0"
}
```

The model predicts one of three wine cultivars: `class_0`, `class_1`, or `class_2`.

## Interactive API Docs

Once the server is running, visit [http://localhost:8000/docs](http://localhost:8000/docs) for the Swagger UI where you can test all endpoints interactively.
