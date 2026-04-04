# Google Places + Ticketmaster → BigQuery Pipeline

Fetches venue and event data from Google Places API and Ticketmaster Discovery API for San Francisco and loads it into BigQuery. Designed to run on a GCP VM (`dateplan-ingest`).

## Project Structure

```
google_places/              ← on your local Mac
├── places_to_bq.py         ← main pipeline: Google Places → BigQuery (grid search + living dataset)
├── sample_fetch.py          ← test Google Places API and inspect data types
├── sample_events.py         ← test Ticketmaster API and inspect event schema
├── requirements.txt         ← python-dotenv, requests, google-cloud-bigquery
├── .env                     ← your secrets (gitignored, never committed)
├── .env.example             ← template for .env
├── .gitignore               ← ignores .env and __pycache__
└── README.md                ← this file
```

On the VM, the files live at: `~/dateplan/`

## Where Data Is Saved

| What | Where |
|------|-------|
| BigQuery dataset | `mlops-project-491402.places_raw` |
| Places table | `mlops-project-491402.places_raw.venues` |
| Events table | `mlops-project-491402.places_raw.events` |
| GCP project | `mlops-project-491402` |
| VM name | `dateplan-ingest` |
| VM zone | `us-central1-f` |

## Table Schema (20 columns)

| Column | Type | Description |
|--------|------|-------------|
| place_id | STRING | Google's unique place identifier |
| display_name | STRING | Business name |
| formatted_address | STRING | Full street address |
| latitude | FLOAT | GPS latitude |
| longitude | FLOAT | GPS longitude |
| distance_km | FLOAT | Distance from SF city center (haversine) |
| rating | FLOAT | Google rating (1.0–5.0) |
| user_rating_count | INTEGER | Number of reviews |
| business_status | STRING | OPERATIONAL, CLOSED_TEMPORARILY, etc. |
| price_level | STRING | PRICE_LEVEL_INEXPENSIVE → VERY_EXPENSIVE |
| primary_type | STRING | Google's single best type |
| category | STRING | Broad category (Food & Drink, Outdoors, etc.) |
| types | REPEATED STRING | All Google place types |
| phone_number | STRING | Local phone number |
| website_uri | STRING | Business website |
| google_maps_uri | STRING | Direct Google Maps link |
| editorial_summary | STRING | Google's short description |
| open_now_text | STRING | Weekly hours |
| search_query | STRING | Which query produced this row |
| fetched_at | TIMESTAMP | UTC time of fetch |

## Grid Search

By default the script splits San Francisco into a **3×3 grid** of 2.5 km-radius circles and runs every query against each cell. This multiplies the results you get from the API (each cell can return up to 60 results per query).

```
  NW (Presidio/Richmond)  |  N (Marina/PacHts)     |  NE (NorthBeach/FiDi)
  W  (Sunset/GoldenGate)  |  C (Haight/Castro)     |  E  (SOMA/Mission)
  SW (OuterSunset/Merced)  |  S (Excelsior/Bernal)  |  SE (Bayview/Dogpatch)
```

Cross-cell duplicates are removed automatically by `place_id`.

To disable grid search and use the original single-circle mode, set in `.env`:

```
USE_GRID=false
```

## Living Dataset (Daily Re-scrapes)

The dedup logic keys on `place_id + date`, not just `place_id`. This means:

- **Same day**: running twice won't create duplicates
- **Next day**: re-scrapes the same venues and inserts new rows, capturing changes in rating, review count, business status, and hours over time

This makes the dataset a time-series you can use to track trends.

## Categories

The `category` column groups Google's granular types into broad labels:

- **Food & Drink** — restaurants, cafes, bars, bakeries, tea houses, etc.
- **Nightlife** — night clubs, karaoke, comedy clubs, live music venues
- **Arts & Culture** — museums, art galleries, theaters, libraries
- **Outdoors** — parks, hiking, gardens, beaches, marinas
- **Sports & Recreation** — bowling, rock climbing, skating, archery, gyms
- **Wellness & Beauty** — spas, yoga studios, salons, nail salons
- **Classes & Workshops** — pottery, cooking, dance, art studios
- **Entertainment** — escape rooms, arcades, movies, aquariums, zoos
- **Pets & Animals** — pet stores, petting zoos, dog parks
- **Shopping** — thrift stores, vintage shops, book stores, florists
- **Other** — anything not yet mapped

To add new types, edit `TYPE_TO_CATEGORY` in `places_to_bq.py`.

---

## Ticketmaster Events API

The project also scrapes live events from the **Ticketmaster Discovery API v2** for the SF area. Events change constantly (new ones posted, old ones sell out, get cancelled) — making this a naturally living dataset.

### API Details

| Item | Value |
|------|-------|
| Endpoint | `https://app.ticketmaster.com/discovery/v2/events.json` |
| Auth | API key as `apikey` query parameter |
| Rate limit | **5,000 requests/day** (resets every 24h) |
| Page size | Max 200 events per page, max 1,000 pages (capped at 1,000 total results per search) |
| Search area | 30-mile radius around SF center (37.7749, -122.4194) |

### Event Schema (from API response)

| Field | Source path | Description |
|-------|-----------|-------------|
| event_id | `id` | Ticketmaster unique event ID |
| name | `name` | Event title |
| event_url | `url` | Ticketmaster event page |
| start_date | `dates.start.localDate` | Start date (YYYY-MM-DD) |
| start_time | `dates.start.localTime` | Start time (HH:MM:SS) |
| end_date | `dates.end.localDate` | End date |
| end_time | `dates.end.localTime` | End time |
| timezone | `dates.timezone` | e.g. America/Los_Angeles |
| status | `dates.status.code` | onsale, offsale, cancelled, etc. |
| segment | `classifications[0].segment.name` | Music, Sports, Arts & Theatre |
| genre | `classifications[0].genre.name` | Comedy, Baseball, Rock, etc. |
| subgenre | `classifications[0].subGenre.name` | More specific category |
| price_min | `priceRanges[0].min` | Lowest ticket price |
| price_max | `priceRanges[0].max` | Highest ticket price |
| venue_name | `_embedded.venues[0].name` | Venue name (Oracle Park, Punch Line, etc.) |
| venue_address | `_embedded.venues[0].address.line1` | Street address |
| venue_city | `_embedded.venues[0].city.name` | City |
| venue_lat | `_embedded.venues[0].location.latitude` | GPS latitude |
| venue_lng | `_embedded.venues[0].location.longitude` | GPS longitude |
| image_url | `images[0].url` | Event image |

### Testing the API

```bash
python sample_events.py                  # fetch 5 upcoming SF events
python sample_events.py "concerts" 10    # fetch 10 concert events
python sample_events.py "comedy"         # fetch 5 comedy events
```

### API Limits

- **5,000 requests per day** (consumer key)
- **100 requests per minute** (OAuth)
- Key never expires
- No credit card required

---

## How to Run (Step by Step)

### Events Pipeline (Ticketmaster)

#### 1. Copy events script to VM

From **Mac terminal**:

```bash
gcloud compute scp ~/Desktop/USF/Spring_MOD_2/MLops/ML_project/google_places/events_to_bq.py \
  dateplan-ingest:/tmp/events_to_bq.py \
  --zone us-central1-f --project mlops-project-491402
```

#### 2. SSH into VM and run

```bash
gcloud compute ssh dateplan-ingest --zone us-central1-f --project mlops-project-491402
```

On the VM:

```bash
cd /home/saisri_maddirala/dateplan
sudo cp /tmp/events_to_bq.py .
source venv/bin/activate
python events_to_bq.py
```

Or filter by keyword:

```bash
python events_to_bq.py "concerts"
python events_to_bq.py "comedy"
```

This fetches up to ~1,000 events per run and loads into `places_raw.events`. Dedup keys on `event_id + date` — same day won't duplicate, next day captures new events, status changes (onsale → sold out → cancelled), and price updates.

#### 3. (First time only) Add Ticketmaster key to VM .env

```bash
sudo sh -c "echo 'TICKETMASTER_API_KEY=your_key_here' >> .env"
```

#### 4. Stop VM when done

From **Mac terminal**:

```bash
gcloud compute instances stop dateplan-ingest --zone us-central1-f --project mlops-project-491402
```

### Places Pipeline (Google Places)

### 1. Copy updated script from Mac to VM

From your **local Mac terminal**:

```bash
gcloud compute scp ~/Desktop/USF/Spring_MOD_2/MLops/ML_project/google_places/places_to_bq.py \
  dateplan-ingest:/tmp/places_to_bq.py \
  --zone us-central1-f --project mlops-project-491402
```

### 2. SSH into the VM

```bash
gcloud compute ssh dateplan-ingest --zone us-central1-f --project mlops-project-491402
```

### 3. (First time only) Set up the VM

```bash
cd ~/dateplan
cp /tmp/places_to_bq.py .
pip install -r requirements.txt
```

Create .env:

```bash
cat > .env << 'EOF'
GOOGLE_PLACES_API_KEY=your_api_key_here
GCP_PROJECT=mlops-project-491402
BQ_DATASET=places_raw
BQ_TABLE=venues
SEARCH_QUERIES=restaurants in San Francisco;bars in San Francisco;coffee shops in San Francisco
EOF
```

Set up BigQuery credentials (one time):

```bash
gcloud auth application-default login
```

Follow the URL, sign in, paste the code back.

### 4. Run the pipeline

```bash
cd ~/dateplan
python places_to_bq.py
```

Or pass queries directly:

```bash
python places_to_bq.py "sushi in San Francisco" "tacos in San Francisco"
```

### 5. (After code changes) Update the script on the VM

From **local Mac**:

```bash
gcloud compute scp ~/Desktop/USF/Spring_MOD_2/MLops/ML_project/google_places/places_to_bq.py \
  dateplan-ingest:/tmp/places_to_bq.py \
  --zone us-central1-f --project mlops-project-491402
```

Then on the **VM**:

```bash
cp /tmp/places_to_bq.py ~/dateplan/
```

### 6. (If schema changes) Drop and recreate the table

On the **VM**:

```bash
cd ~/dateplan
python -c "from google.cloud import bigquery; c=bigquery.Client(project='mlops-project-491402'); c.delete_table('mlops-project-491402.places_raw.venues', not_found_ok=True); print('Table deleted')"
python places_to_bq.py
```

### 7. Add new search queries

Edit .env on the **VM** — add queries separated by semicolons:

```bash
nano ~/dateplan/.env
```

Or overwrite with `cat > .env << 'EOF' ... EOF`.

The script deduplicates by `place_id`, so re-running with overlapping queries won't create duplicates.

### 8. (Optional) Set up a cron job

On the **VM**:

```bash
cat > ~/dateplan/run_places.sh << 'EOF'
#!/bin/bash
cd ~/dateplan
source venv/bin/activate
python places_to_bq.py >> /tmp/places_cron.log 2>&1
EOF
chmod +x ~/dateplan/run_places.sh

crontab -e
```

Add (runs daily at 6 AM UTC):

```
0 6 * * * /home/saisri_maddirala/dateplan/run_places.sh
```

Check logs:

```bash
cat /tmp/places_cron.log
```

---

## Quick Reference Commands

| Task | Where | Command |
|------|-------|---------|
| Copy file to VM | Mac | `gcloud compute scp <file> dateplan-ingest:/tmp/<file> --zone us-central1-f --project mlops-project-491402` |
| SSH into VM | Mac | `gcloud compute ssh dateplan-ingest --zone us-central1-f --project mlops-project-491402` |
| Run places pipeline | VM | `cd ~/dateplan && python places_to_bq.py` |
| Run events pipeline | VM/Mac | `python events_to_bq.py` |
| Check .env | VM | `cat ~/dateplan/.env` |
| Drop table | VM | `python -c "from google.cloud import bigquery; ..."` (see step 6) |
| Exit VM | VM | `exit` |
| Query places | Console | `SELECT * FROM mlops-project-491402.places_raw.venues LIMIT 10` |
| Query events | Console | `SELECT * FROM mlops-project-491402.places_raw.events LIMIT 10` |
