# Plot — Demo UI

A single-file, no-build HTML demo that talks to the **FastAPI Decision Engine** and shows ranked venue recommendations for a group of 3 users.

Files in this folder:

- `demo.html` — the full demo page (HTML + CSS + JS in one file)

## What it does

- Lets you set **budget / max distance / categories** for 3 mock users.
- Sends a `POST /recommend` to FastAPI.
- Displays the **merged group preferences** and **top venues** with name, rating, distance, score, and reason.

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
- A **Group agreement** card (merged budget / distance / categories).
- A list of venue cards, each with rating, distance, score, reason, and a Google Maps link.

## Troubleshooting

- **`Address already in use`** — another process is on port 8080.
  `lsof -ti tcp:8080 | xargs kill -9` or start on another port and update the API URL in the page.
- **"Network error" in the page** — the API URL is wrong or FastAPI isn't running. Check terminal 1 for a `POST /recommend` log when you click.
- **500 from API** — usually BigQuery credentials. Run once:
  `gcloud auth application-default login`
  and ensure `GCP_PROJECT=mlops-project-491402` is set (in `.env`).
