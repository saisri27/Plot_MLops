import mlflow
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

mlflow.set_tracking_uri("sqlite:////mlflow-data/mlflow.db")

app = FastAPI(title="Wine Quality Classifier")
model = None

WINE_CLASS_NAMES = {0: "class_0", 1: "class_1", 2: "class_2"}


class WineFeatures(BaseModel):
    model_config = {"populate_by_name": True}

    alcohol: float
    malic_acid: float
    ash: float
    alcalinity_of_ash: float
    magnesium: float
    total_phenols: float
    flavanoids: float
    nonflavanoid_phenols: float
    proanthocyanins: float
    color_intensity: float
    hue: float
    od280_od315_of_diluted_wines: float = Field(alias="od280/od315_of_diluted_wines")
    proline: float


class PredictionResponse(BaseModel):
    prediction: int
    class_name: str


@app.on_event("startup")
def load_model():
    global model
    try:
        model = mlflow.pyfunc.load_model("models:/wine_model_from_nb/1")
    except Exception as e:
        print(f"Failed to load model: {e}")


@app.get("/")
def root():
    return {"message": "Welcome to the Wine Quality Classifier API"}


@app.get("/health")
def health():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model_loaded": True}


@app.post("/predict", response_model=PredictionResponse)
def predict(features: WineFeatures):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    df = pd.DataFrame([features.model_dump(by_alias=True)])
    prediction = int(model.predict(df)[0])

    return PredictionResponse(
        prediction=prediction,
        class_name=WINE_CLASS_NAMES.get(prediction, f"unknown_{prediction}"),
    )
