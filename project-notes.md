# Coastal Telemetry Interface Project Notes

## Project Direction

- Official project name: **Coastal Telemetry Interface (CTI)**
- Build a scientific dashboard project for portfolio value, not a Nexus clone.
- Focus on a field-team style workflow with one specific area first.
- Use live, regularly updated scientific data.
- Design for scientific decision support (not just charts).

## Core Concept

Create a **Coastal Field Conditions Monitor** using Canadian marine buoy observations from ECCC MSC GeoMet.

Primary outcome:
- Help a small scientific team decide whether conditions are suitable for field work.

## Why This Project Fits Career Goals

- Demonstrates scientific data handling and interpretation.
- Shows practical operational thinking for field teams.
- Proves ability to turn raw telemetry into actionable insights.
- Aligns with small-team, applied science environments.

## Data Source Choice

Primary data source:
- ECCC MSC GeoMet OGC API (`api.weather.gc.ca`)

Reasons:
- Free and public
- No API key required for read access
- Canada-first coverage aligned with target waters
- OGC API filtering and paging support for single-station and multi-station workflows
- Suitable for starting with one buoy and expanding regionally from the same API

## Data Access Endpoints Discussed

API landing page:
- `https://api.weather.gc.ca/`

Marine station metadata collection:
- `https://api.weather.gc.ca/collections/swob-marine-stations`
- `https://api.weather.gc.ca/collections/swob-marine-stations/items?f=json&limit=<N>&offset=<N>`

Single station metadata by MSC station id:
- `https://api.weather.gc.ca/collections/swob-marine-stations/items/<MSC_ID>?f=json`

Realtime observations collection:
- `https://api.weather.gc.ca/collections/swob-realtime/items?f=json&limit=<N>`

Single-station realtime observations by WMO id:
- `https://api.weather.gc.ca/collections/swob-realtime/items?f=json&wmo_synop_id-value=<WMO_ID>&limit=<N>`

Key references:
- `https://eccc-msc.github.io/open-data/msc-geomet/readme_en/`
- `https://eccc-msc.github.io/open-data/msc-geomet/ogc_api_en/`

## API Limits and Usage Guidance

- No API key required for GeoMet read access.
- No explicit numeric request-per-minute cap identified in the referenced docs.
- Query responses are limited to **10,000 features per query**; use `limit` + `offset` for pagination.
- Use `resulttype=hits` when needed to get match counts for paging strategies.
- Use reasonable polling + caching + backoff to keep requests polite and resilient.

## Variables to Consider

- Wind direction/speed/gust
- Wave height and period
- Air temperature
- Water temperature
- Pressure

Optional:
- Tide or related context where available

## Multi-Buoy Expansion Strategy

Start small:
- Single area and one buoy (or a short local watchlist)

Scale to multiple buoys:
- Build a local station registry from `swob-marine-stations` (name, coordinates, `wmo_id`; `msc_id` optional later)
- Pull single-buoy observations from `swob-realtime` using `wmo_synop_id-value=<WMO_ID>`
- Expand to multiple buoys by iterating selected station ids in the same region
- Keep a curated station watchlist
- Add retries, caching, and backoff
- Mark stale or missing observations

## Suggested Dashboard Sections

- Current Conditions panel (latest values)
- Trends panel (24h/7d)
- Risk/Threshold panel (safe, caution, unsafe)
- Data Quality panel (staleness, missingness)
- Optional regional comparison (for multi-buoy mode)

## Map Page Strategy (MVP)

- Primary map purpose: fast situational awareness for a field science team.
- Show all marine stations as map points using `swob-marine-stations` coordinates.
- For each station, show the most recent available observation within a practical fetch window (for example, last 90 minutes), then keep one latest record per station.
- Use **color** for condition severity and **opacity** for data age.
- Freshness visual model:
  - Newer points = more opaque
  - Points approaching 60 minutes old = progressively more transparent
  - Older than the freshness window = stale/offline style
- Keep map UX simple in MVP: no additional timestamp sync mode or cadence filter required at first.

## Station Detail Page Strategy

- Clicking a map point opens a station-specific page.
- Station page fetches historical data for that station by `wmo_synop_id-value` and selected `datetime` range.
- Default to a short range (for example, 24h or 7d) for fast initial load.
- Allow user-selected larger ranges (30d/90d/1y), using additional chunked/paginated calls as needed.
- Keep API calls efficient by caching station metadata and chunking long history requests.

## Backend Architecture Decision (MVP Foundation)

- **This repository is the backend repo** (`coastal-telemetry-backend`). It owns ingestion, persistence, REST API, and **`dev-log/`** for all CTI work streams (backend and frontend sessions).
- Build backend first, frontend second.
- Frontend remains React, but all production data access should go through CTI backend services rather than direct GeoMet calls.
- Chosen backend stack for MVP:
  - NestJS + TypeScript
  - REST API
  - PostgreSQL as primary datastore
- Rationale:
  - All users consume effectively the same operational dataset.
  - A shared backend cache/ingestion layer prevents duplicated per-user upstream calls.
  - This isolates GeoMet from traffic spikes and provides a stable app-facing contract even as frontend design evolves.

## Frontend vs backend split

Clear **binary boundary**: the **backend** owns all upstream I/O, persistence, and shaping of read models; the **frontend** owns presentation and interaction only. Production UI **never** calls GeoMet directly.

### Backend (NestJS + PostgreSQL)

- **Ingest:** Scheduled jobs tick continuously—overlap pulls in steady state, global watermark lag detection, **15-minute** chunk backfill when behind or cold-starting from empty DB, **one-year** rolling retention (see **Global ingest cursor, backfill, and retention**).
- **Store:** PostgreSQL is the **system of record** (normalized station registry + observations), not a per-browser cache.
- **Isolate GeoMet:** Only the backend calls `api.weather.gc.ca`; spikes in user traffic do not multiply upstream requests.
- **Serve:** REST endpoints return **DTOs / JSON shaped for the interface**—map-latest aggregates, station history series, freshness/stale semantics—so React consumes stable contracts rather than raw SWOB payloads.

### Frontend (React)

- **Read-only consumer** of CTI’s REST API for production data (map, station detail, trends).
- **No authoritative telemetry** in the browser; no direct GeoMet credentials or polling in production.
- **UX:** Layout, charts, map styling (severity color, freshness opacity), routing, accessibility—design can change without altering how upstream data is collected.

### Core backend mechanism (summary)

The backend **runs on a schedule**: collect and normalize buoy data into Postgres with idempotent dedupe; **detect lag** via the global watermark and **replay missing wall-clock coverage** in bounded chunks after restarts or outages; **trim** history to one year; **respond** to frontend requests with **interface-ready** payloads derived from stored rows—not live GeoMet passthrough.

## Repository layout (deploy split)

- **This Git repository (`coastal-telemetry-backend`):** CTI **backend** home—NestJS service (when implemented), PostgreSQL ingest and migrations, GeoMet reference scripts, integration tests, and the **canonical `dev-log/`** (one gapless history for the whole product).
- **Separate frontend repository (planned):** React app for Railway deploy only; **does not** host a second dev-log—sessions focused on UI still append logs **here** so portfolio and continuity stay in one place.
- **Git remote name on GitHub:** `coastal-telemetry-backend` (rename from `coastal-telemetry-interface` so the repo name matches this codebase role).

## Data Ingestion and Caching Strategy

- Treat backend as the system of record for app reads.
- Do not trigger external API calls directly from frontend sessions.
- Use scheduled ingestion jobs:
  - Marine station registry refresh (`swob-marine-stations`) on low cadence (for example daily).
  - Realtime observation ingest (`swob-realtime`) on high cadence for near-real-time updates.
- Use overlapping ingestion windows (for example `now-3m .. now` per run), not strict one-minute non-overlap windows.
- Deduplicate on ingest so overlap is safe and idempotent.
- Serve all app queries from PostgreSQL (latest-per-station map view, station history ranges, freshness/status metadata).

## Global ingest cursor, backfill, and retention

Aligned with **global all-station** realtime pulls (same time windows for the fleet in each job). Ingest progress through time uses **one global watermark**, not per-station backfill cursors.

- **Watermark:** \(W = \max(\text{observed\_at})\) across **all** stored observation rows. This is the latest measurement time CTI has successfully pulled through for the network; sparse stations may have **no row** for many minutes— that does not move \(W\), which is dominated by the freshest reporting station.
- **Steady state:** Run a short cadence (for example **every minute**) and request an **overlapping** realtime window (for example roughly the **last ~2 minutes**) so late-arriving rows stay covered; overlap plus minute-normalized dedupe on `(station_wmo_id, observed_at)` stays idempotent.
- **Behind-schedule detection:** If **`now − W`** is greater than about **1.5 minutes**, treat scheduled global coverage as lagging (missed ticks or downtime) and run **backfill** from watermark \(W\) toward `now`.
- **Backfill chunking:** Walk forward in **15-minute** windows (safe bulk size for all-station calls and consistent with GeoMet paging limits). Repeat until caught up, then return to steady overlap pulls.
- **Cold start / empty database:** Backfill from **`now − 1 year`** (maximum historical depth) forward in **15-minute** chunks until \(W\) is current, then steady state as above.
- **Retention (rolling one year):** Delete or partition away observations with **`observed_at` older than one year** relative to `now`. Keeps Postgres size **bounded on Railway**, matches the **longest UI history range** (one year), and avoids unbounded growth.
- **Invariant (portfolio clarity):** Backfill closes **gaps in wall-clock global poll coverage**, not guaranteed per-station completeness; quiet buoys remain sparse by nature.
- **Implementation note:** Run retention on a **batch schedule** (for example daily) or via **time partitioning** where practical—avoid expensive full-table deletes on every minute tick.

## Near-Real-Time Trade-off Policy

- Field workflow requires fresh data, but full-network one-minute polling can create unnecessary load.
- Preferred operating policy:
  - Broad baseline cadence for full network.
  - Higher-frequency priority monitoring for selected stations/active operations when needed.
- Exact cadence can be tuned after baseline performance and data recency are measured in live runs.

## Initial Backend API Shape (Working Contract)

- `GET /map/latest`
  - Returns latest observation per station plus freshness state.
- `GET /stations/:id/history?minutes=<N>`
  - Returns exact bounded history from backend store for one station.
- Optional operational endpoint:
  - `GET /health/ingestion-lag` for monitoring freshness of ingestion pipeline.

## Database Field Plan (v1)

Target: **PostgreSQL** with a lean column set for Railway-style hosting (avoid storing full raw GeoJSON per observation in v1).

### Station registry (one row per marine station)

| Field | Notes |
|--------|--------|
| `wmo_id` | Primary key / join key; matches realtime `wmo_synop_id-value` and marine registry `wmo_id`. |
| `name_en` | Display name for map and station UI (from marine stations collection). |
| `latitude` | Decimal degrees; map pin. |
| `longitude` | Decimal degrees; map pin. |

**Deferred for later if needed:** `msc_id` (catalog item id for GeoMet station URLs — not required for joins or MVP UI).

### Observations (one row per station per observation time)

Marine buoy data is effectively **minute-grain**; treat duplicate `(station, observed_at)` from overlapping ingest windows as **one row** (upsert / keep one).

**Identity and times**

| Field | Notes |
|--------|--------|
| `station_wmo_id` | FK to station `wmo_id`. |
| `observed_at` | UTC timestamp when the measurement applies; normalize to **minute precision** for dedupe. |
| `ingested_at` | UTC timestamp when CTI stored the row (pipeline health vs sensor time). |

**Unique constraint (v1):** `(station_wmo_id, observed_at)` after normalizing `observed_at` to minute resolution.

**Measurements** (nullable where the source has no value for that observation)

| Logical field | Usage |
|-----------------|--------|
| Wind speed | Sustained wind. |
| Wind direction | Degrees or API-native representation (document units in ingest layer). |
| Wind gust | If present in feed. |
| Wave height | Primary wave / significant height per mapped SWOB field. |
| Wave period | Seconds. |
| Air temperature | Surface air. |
| Water temperature | Sea temperature. |
| Pressure | One consistent pressure type from the feed (document which SWOB field maps here). |

Exact PostgreSQL column names and units (e.g. `wind_speed_kmh`, `pressure_kpa`) are chosen at migration time; ingest maps GeoMet SWOB `properties` keys onto these columns.

**Out of scope for v1:** upstream GeoJSON `Feature.id` / provenance column — dedupe relies on `(station_wmo_id, observed_at)` only.

## Recommended MVP Scope

Phase 1:
- One region
- One primary buoy (or up to 3 local buoys)
- 4-6 key metrics
- Clear field decision framing

Phase 2:
- Multi-buoy comparison
- Alert logic
- Better anomaly detection and historical context

## Next Decisions Needed

1. Choose target region
2. Pick initial buoy (`WMO_ID`; add `MSC_ID` only if a concrete need appears)
3. Define field safety thresholds
4. Define the main decision question (for example, whether tomorrow morning is a viable sampling window)
5. Define map freshness thresholds (fresh/delayed/stale) and severity coloring rules for initial operations view
6. Define ingestion cadence values for baseline and priority station modes
7. Define ingest mapping from GeoMet SWOB `properties` keys to observation columns (units + null handling)
8. Decide ORM/tooling for NestJS + PostgreSQL implementation (for example Prisma vs TypeORM)

