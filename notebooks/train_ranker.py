"""
train_ranker.py
===============
Trains the first ML ranker (v1) for Plot, replacing — or competing with — the
v0 weighted scoring formula in decision_engine.compute_score.

Runs as a plain script (`python notebooks/train_ranker.py`) AND opens as an
interactive notebook in VS Code (the `# %%` markers below are cell breaks).

Data
----
Reads `training_data/plot_training_latest.csv` produced by build_training_data.py.
Each row is one (rec_id, venue) candidate with engineered features and a label
that is 1 (yay/visited), 0 (nahh), or NaN (shown but no feedback).

Modeling choice for v1
----------------------
Pointwise binary classification rather than listwise LambdaRank, because:
  - We only have ~67 explicit labels (53 yay / 14 nahh). LambdaRank wants
    multiple ranks per group; we'd be inventing them.
  - Binary "predict_proba(yay)" gives a real-valued score we can rank by,
    so eval still uses NDCG@5 — same shape as the future LambdaRank.
  - Easier MLflow story: one model, one threshold-free metric.

We treat unlabeled rows (shown but no feedback) as 0 with the option to also
filter them out — the implicit-negative path is a knob, not a default.

Eval
----
We compute NDCG@5 per rec_id on a group-aware held-out split (no rec_id ever
appears in both train and test). Baseline = the v0 `score_at_recommendation`
already in the CSV. The model has to beat v0 on NDCG@5 to be worth shipping.
"""

# %% Imports -----------------------------------------------------------------
from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

# Load .env so MLFLOW_TRACKING_URI (and anything else) is picked up
# automatically when the script runs. Soft-skip if dotenv isn't installed.
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

import mlflow
import mlflow.sklearn
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import ndcg_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("train_ranker")

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = REPO_ROOT / "training_data" / "plot_training_latest.csv"
MLRUNS_PATH = REPO_ROOT / "mlruns"

# Filed-under-future-self knobs. Changing these should change MLflow params,
# which is why they're surfaced at the top of the script.
TREAT_UNLABELED_AS_NEGATIVE = True
TEST_SIZE = 0.25
RANDOM_STATE = 42
NDCG_K = 5
N_ESTIMATORS = 200
LEARNING_RATE = 0.05
MAX_DEPTH = 3

# %% Load --------------------------------------------------------------------
if not DATA_PATH.exists():
    raise SystemExit(
        f"{DATA_PATH} not found. Run `python build_training_data.py` first to "
        "build it from Supabase."
    )

df = pd.read_csv(DATA_PATH)
log.info("Loaded %d rows, %d unique recs", len(df), df["rec_id"].nunique())
log.info(
    "Label dist: yay=%d nahh=%d unlabeled=%d",
    int((df["label"] == 1.0).sum()),
    int((df["label"] == 0.0).sum()),
    int(df["label"].isna().sum()),
)

# %% Build target ------------------------------------------------------------
# y = 1 iff feedback was yay/visited. Everything else is 0 (explicit nahh OR
# unlabeled). The TREAT_UNLABELED_AS_NEGATIVE flag controls whether unlabeled
# rows are kept; turning it off gives a tiny but cleaner dataset.
if TREAT_UNLABELED_AS_NEGATIVE:
    df["y"] = (df["label"] == 1.0).astype(int)
    train_df = df.copy()
else:
    train_df = df.dropna(subset=["label"]).copy()
    train_df["y"] = (train_df["label"] == 1.0).astype(int)

log.info(
    "Training rows: %d | positives: %d (%.1f%%)",
    len(train_df),
    int(train_df["y"].sum()),
    100 * train_df["y"].mean(),
)

# %% Features ----------------------------------------------------------------
# Anything containing the label, the venue identity, or the LLM's pick is
# considered leakage and dropped. score_at_recommendation IS kept — it's the
# v0 score and a strong feature for the model to "correct" against.
LEAK_COLS = {
    "label",
    "feedback_user_id",
    "feedback_signal",
    "venue_name",  # identity, no signal beyond what features capture
    "rec_created_at",
    "model_version",
    "llm_picked",  # the LLM saw the same features; this would short-circuit learning
    "from_candidate_set",  # constant in current pipeline
}
NUMERIC_FEATURES = [
    "group_size",
    "merged_max_distance_km",
    "n_categories",
    "rating",
    "distance_km",
    "budget_gap",
    "category_in_group",
    "distance_remaining_km",
    "score_at_recommendation",
]
CATEGORICAL_FEATURES = ["merged_budget", "category", "price_level"]

X = train_df[NUMERIC_FEATURES + CATEGORICAL_FEATURES].copy()
y = train_df["y"].values
groups = train_df["rec_id"].values

# %% Group-aware split -------------------------------------------------------
# Splitting on rows would leak: the same rec_id (and therefore the same group
# of candidates the user saw together) could appear in both sides.
splitter = GroupShuffleSplit(n_splits=1, test_size=TEST_SIZE, random_state=RANDOM_STATE)
train_idx, test_idx = next(splitter.split(X, y, groups))
X_train, X_test = X.iloc[train_idx], X.iloc[test_idx]
y_train, y_test = y[train_idx], y[test_idx]
groups_train, groups_test = groups[train_idx], groups[test_idx]

log.info(
    "Split: %d train rows (%d recs) / %d test rows (%d recs)",
    len(X_train),
    len(np.unique(groups_train)),
    len(X_test),
    len(np.unique(groups_test)),
)

# %% Pipeline + train --------------------------------------------------------
# OneHotEncoder for the small handful of categorical columns; GBT handles the
# numerics natively.
encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
ct = ColumnTransformer(
    transformers=[("cat", encoder, CATEGORICAL_FEATURES)],
    remainder="passthrough",
)
model = Pipeline(
    steps=[
        ("features", ct),
        (
            "gbt",
            GradientBoostingClassifier(
                n_estimators=N_ESTIMATORS,
                learning_rate=LEARNING_RATE,
                max_depth=MAX_DEPTH,
                random_state=RANDOM_STATE,
            ),
        ),
    ]
)

model.fit(X_train, y_train)

# %% Predict + metrics -------------------------------------------------------
proba_test = model.predict_proba(X_test)[:, 1]


def ndcg_at_k_per_group(
    scores: np.ndarray, labels: np.ndarray, group_ids: np.ndarray, k: int
) -> float:
    """
    Mean NDCG@k computed once per rec_id. Skips groups with no positive label
    (NDCG is undefined / 0 by convention there).
    """
    per_group: list[float] = []
    for gid in np.unique(group_ids):
        mask = group_ids == gid
        # NDCG needs >=2 candidates and at least one positive to be defined.
        if mask.sum() < 2 or labels[mask].sum() == 0:
            continue
        # ndcg_score wants 2D arrays
        per_group.append(ndcg_score([labels[mask]], [scores[mask]], k=k))
    return float(np.mean(per_group)) if per_group else 0.0


# v0 baseline: rank by the score that was already there at recommendation time.
v0_scores_test = X_test["score_at_recommendation"].values
ndcg_v1 = ndcg_at_k_per_group(proba_test, y_test, groups_test, NDCG_K)
ndcg_v0 = ndcg_at_k_per_group(v0_scores_test, y_test, groups_test, NDCG_K)

# AUC is also computed for sanity — it's pointwise so it ignores groups.
auc_v1 = roc_auc_score(y_test, proba_test) if len(np.unique(y_test)) > 1 else float("nan")

log.info("NDCG@%d (v1 GBT)        : %.4f", NDCG_K, ndcg_v1)
log.info("NDCG@%d (v0 baseline)   : %.4f", NDCG_K, ndcg_v0)
log.info("ROC-AUC (v1, pointwise) : %.4f", auc_v1)

# %% MLflow log --------------------------------------------------------------
# Prefer the team-shared MLflow on Cloud Run when MLFLOW_TRACKING_URI is set
# (e.g. https://mlflow-server-...run.app). Cloud Run requires IAM auth, so we
# also set MLFLOW_TRACKING_TOKEN to a fresh `gcloud auth print-identity-token`.
# Falls back to repo-local file:./mlruns when the env var is unset, so the
# script still runs offline / in CI without GCP creds.
tracking_uri = os.environ.get("MLFLOW_TRACKING_URI")
if (
    tracking_uri
    and tracking_uri.startswith("https://")
    and not os.environ.get("MLFLOW_TRACKING_TOKEN")
):
    # HTTPS endpoint (likely Cloud Run / IAM-protected) — fetch a fresh
    # identity token so the MLflow client can send Bearer auth. Plain HTTP
    # endpoints (like a VM hosting MLflow on port 5000) skip this.
    try:
        token = subprocess.run(
            ["gcloud", "auth", "print-identity-token"],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        ).stdout.strip()
        os.environ["MLFLOW_TRACKING_TOKEN"] = token
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as exc:
        log.warning(
            "Could not fetch identity token via gcloud (%s) — MLflow auth may fail. "
            "Run `gcloud auth login` or unset MLFLOW_TRACKING_URI to use local files.",
            exc,
        )

if not tracking_uri:
    tracking_uri = f"file:{MLRUNS_PATH}"
    log.info("MLflow tracking URI: %s (local fallback)", tracking_uri)
else:
    log.info("MLflow tracking URI: %s", tracking_uri)

mlflow.set_tracking_uri(tracking_uri)
mlflow.set_experiment("plot-ranker")

with mlflow.start_run(run_name="gbt_v1_pointwise") as run:
    mlflow.log_params(
        {
            "model_family": "sklearn.GradientBoostingClassifier",
            "n_estimators": N_ESTIMATORS,
            "learning_rate": LEARNING_RATE,
            "max_depth": MAX_DEPTH,
            "treat_unlabeled_as_negative": TREAT_UNLABELED_AS_NEGATIVE,
            "test_size": TEST_SIZE,
            "ndcg_k": NDCG_K,
            "n_train_rows": int(len(X_train)),
            "n_test_rows": int(len(X_test)),
            "n_train_groups": int(len(np.unique(groups_train))),
            "n_test_groups": int(len(np.unique(groups_test))),
            "n_positives_train": int(y_train.sum()),
            "n_positives_test": int(y_test.sum()),
            "data_snapshot": DATA_PATH.name,
        }
    )
    mlflow.log_metrics(
        {
            f"ndcg_at_{NDCG_K}_v1": ndcg_v1,
            f"ndcg_at_{NDCG_K}_v0_baseline": ndcg_v0,
            f"ndcg_at_{NDCG_K}_lift": ndcg_v1 - ndcg_v0,
            "roc_auc_v1": auc_v1 if not np.isnan(auc_v1) else 0.0,
        }
    )
    # Save the model locally so we don't lose it. We deliberately don't upload
    # to MLflow as an artifact — the remote server's artifact-store is a VM
    # local path the client can't write to. Re-configure the server with
    # `--artifacts-destination gs://... --serve-artifacts` to fix that, then
    # restore mlflow.log_artifact below.
    import joblib  # local import; only needed for this save path

    models_dir = REPO_ROOT / "models"
    models_dir.mkdir(parents=True, exist_ok=True)
    model_path = models_dir / f"plot_ranker_{run.info.run_id}.joblib"
    joblib.dump(model, model_path)
    mlflow.set_tag("model_artifact_local_path", str(model_path))
    log.info("Model saved locally: %s", model_path)
    log.info("MLflow run id:       %s", run.info.run_id)
    log.info("Tracking URI:        %s", mlflow.get_tracking_uri())
