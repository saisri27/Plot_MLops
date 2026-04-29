# Plot — Demo UI

A single-file, no-build HTML demo that talks to the **FastAPI Decision Engine** and shows ranked venue recommendations for a group of 4 friends in San Francisco.

Files in this folder:

- `demo.html` — the full demo page (HTML + CSS + JS in one file)

## What it does

- Lets you set **budget / max distance / categories** for 4 friends (Sai, PJ, Arushi, Josh).
- Sends a `POST /recommend` to FastAPI.
- Displays the **merged group preferences** and **top venues** with name, rating, distance, score, and reason.
- Each venue card has **Yay 🎉 / Nahh 👎** buttons that POST to `/feedback` and write a labelled training row to Supabase, linked to the recommendation that produced it via `rec_id`.

## 1. Start the API (terminal 1)

From the repo root:

```bash
cd /Users/saisrimaddirala/Plot_MLops
source /path/to/mlops_env/bin/activate   # or your venv
uvicorn decision_engine:app --reload --port 8080
```

You should see `Uvicorn running on http://127.0.0.1:8080`.

> The API already has **CORS** enabled, so the demo page can call it from the browser.

## 2. Serve the demo page (terminal 2)

From the repo root:

```bash
cd /Users/saisrimaddirala/Plot_MLops
python3 -m http.server 5500
```

Then open: [http://127.0.0.1:5500/demo/demo.html](http://127.0.0.1:5500/demo/demo.html)

> You can also open `demo.html` directly by double-clicking it. Serving via `http.server` is just more reliable across browsers.

## 3. Use it

1. In the **API URL** field at the top, make sure it points to your running API, e.g.
   `http://127.0.0.1:8080/recommend`.
2. Adjust the 3 user cards (budget, distance, categories).
3. Pick **Top K** (default 5).
4. Click **Recommend**.

You will see:
- A **Group agreement** card (merged budget / distance / categories) plus a `rec_id` you can grep in Supabase.
- A list of venue cards, each with rating, distance, score, reason, a Google Maps link, and **Yay / Nahh** buttons.

## 4. Generating training data

Every click on **Recommend** writes a row to Supabase `recommendation_log` (with `rec_id`, the merged group prefs, and the full top-K venue snapshot). Every **Yay / Nahh** writes a row to `feedback` linked back to that `rec_id`.

To pull a clean training table out of Supabase:

```bash
cd /Users/saisrimaddirala/Plot_MLops
python build_training_data.py
```

This produces:

- `training_data/plot_training_<timestamp>.csv` — immutable snapshot
- `training_data/plot_training_latest.csv` — what your training notebook should read

Each row is one `(rec_id, candidate venue)` pair with engineered features (budget gap, category-in-group flag, distance remaining, the score the rules engine gave it, etc.) and a `label` column (`1` for yay/visited, `0` for nahh, blank for unscored). This is the input to the Learning-to-Rank step that will be wrapped in MLflow next.

## Troubleshooting

- **`Address already in use`** — another process is on port 8080.
  `lsof -ti tcp:8080 | xargs kill -9` or start on another port and update the API URL in the page.
- **"Network error" in the page** — the API URL is wrong or FastAPI isn't running. Check terminal 1 for a `POST /recommend` log when you click.
- **500 from API** — usually BigQuery credentials. Run once:
  `gcloud auth application-default login`
  and ensure `GCP_PROJECT=mlops-project-491402` is set (in `.env`).
