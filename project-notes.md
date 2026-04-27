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
- Build a local station registry from `swob-marine-stations` (name, coordinates, wmo_id, msc_id)
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

## Data Ingestion and Caching Strategy

- Treat backend as the system of record for app reads.
- Do not trigger external API calls directly from frontend sessions.
- Use scheduled ingestion jobs:
  - Marine station registry refresh (`swob-marine-stations`) on low cadence (for example daily).
  - Realtime observation ingest (`swob-realtime`) on high cadence for near-real-time updates.
- Use overlapping ingestion windows (for example `now-3m .. now` per run), not strict one-minute non-overlap windows.
- Deduplicate on ingest so overlap is safe and idempotent.
- Serve all app queries from PostgreSQL (latest-per-station map view, station history ranges, freshness/status metadata).

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
2. Pick initial buoy (with `MSC_ID` + `WMO_ID`)
3. Define field safety thresholds
4. Define the main decision question (for example, whether tomorrow morning is a viable sampling window)
5. Define map freshness thresholds (fresh/delayed/stale) and severity coloring rules for initial operations view
6. Define ingestion cadence values for baseline and priority station modes
7. Define dedupe key strategy for observation writes (idempotent overlap handling)
8. Decide ORM/tooling for NestJS + PostgreSQL implementation (for example Prisma vs TypeORM)

