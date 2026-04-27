# Marine Reference Scripts

Reference Node.js scripts for GeoMet marine station and realtime ingestion experiments.

## Requirements

- Node.js 18+ (uses built-in `fetch`)

## 1) Get Marine Stations

Script: `scripts/get-marine-stations.js`

Fetches marine stations and outputs a JSON array of minimal station objects:

- `id`: station WMO ID (string)
- `location`: `{ latitude, longitude }`

### Run

```bash
node scripts/get-marine-stations.js
```

Write output to file:

```bash
node scripts/get-marine-stations.js --out marine-stations-minimal.json
```

### Output Shape

```json
[
  {
    "id": "46134",
    "location": {
      "latitude": 48.6483,
      "longitude": -123.495
    }
  }
]
```

## 2) Get Raw Marine Realtime Data by 15-Min Window

Script: `scripts/get-marine-15m-window-raw.js`

Fetches one 15-minute window of `swob-realtime`, filters to marine stations, and returns exactly one entry per marine station ID:
- latest raw record when available
- `null` when no reading is available in the window

### Iteration Semantics

- `--iteration 1`: `now-15m` to `now`
- `--iteration 2`: `now-30m` to `now-15m`
- `--iteration 3`: `now-45m` to `now-30m`

### Run

```bash
node scripts/get-marine-15m-window-raw.js --iteration 1
```

Write output to file:

```bash
node scripts/get-marine-15m-window-raw.js --iteration 2 --out marine-iteration-2.json
```

### Output Shape

```json
{
  "metadata": {
    "iteration": 2,
    "windowStart": "2026-04-22T09:30:00Z",
    "windowEnd": "2026-04-22T09:45:00Z",
    "numberMatched": 4151,
    "numberReturned": 4151,
    "marineStationCount": 62,
    "marineFeatureCount": 210,
    "stationEntryCount": 62,
    "latestStationCount": 58,
    "stationsWithDataCount": 58,
    "stationsWithoutDataCount": 4,
    "hasNextLink": false,
    "realtimeUrl": "https://api.weather.gc.ca/collections/swob-realtime/items?..."
  },
  "stations": {
    "46134": {
      "type": "Feature",
      "id": "2026-04-22-0940-XXXX-AUTO-minute-swob.xml",
      "geometry": { "type": "Point", "coordinates": [-123.495, 48.6483, 0] },
      "properties": {
        "wmo_synop_id-value": "46134",
        "obs_date_tm": "2026-04-22T09:40:00.000Z"
      }
    },
    "45139": null
  }
}
```

## Notes

- These scripts are intentionally standalone references and can be merged into a larger data-ingestion workflow later.
- `swob-realtime` is paged; when a response includes a `next` link, a single call may not contain all rows for that window.

## 3) Get Raw Data for Station List (Sweep Up To 90m)

Script: `scripts/get-stations-coverage-90m-raw.js`

Sweeps non-overlapping 15-minute windows until all requested station IDs are covered or the script reaches a 90-minute cap (6 windows total). Returns exactly one entry per requested station ID:
- latest raw record when found during sweep
- `null` when no reading is found up to 90 minutes

### Input

- `--station-ids-json`: required JSON array of station IDs
  - example: `"[\"46134\",\"44251\",\"45139\"]"`

### Run

```bash
node scripts/get-stations-coverage-90m-raw.js --station-ids-json "[\"46134\",\"44251\"]"
```

Write output to file:

```bash
node scripts/get-stations-coverage-90m-raw.js --station-ids-json "[\"46134\",\"44251\"]" --out stations-coverage-90m.json
```

### Behavior

- Window 1: `now-15m` to `now`
- Window 2: `now-30m` to `now-15m`
- ...
- Window 6: `now-90m` to `now-75m`
- Stops early if all requested station IDs have at least one raw row
- Keeps output raw (no schema flattening), but only one newest record per station and never drops requested station IDs

### Output Shape

```json
{
  "metadata": {
    "requestedStationCount": 2,
    "coveredStationCount": 2,
    "missingStationIds": [],
    "stationEntryCount": 2,
    "latestStationCount": 2,
    "stationsWithDataCount": 2,
    "stationsWithoutDataCount": 0,
    "nullStationCount": 0,
    "windowsTried": 1,
    "maxWindows": 6,
    "maxLookbackMinutes": 90,
    "windowMinutes": 15,
    "nextLinkWarnings": 0
  },
  "windows": [
    {
      "iteration": 1,
      "windowStart": "2026-04-23T07:00:00Z",
      "windowEnd": "2026-04-23T07:15:00Z",
      "rawMatchCount": 2,
      "hasNextLink": false
    }
  ],
  "stations": {
    "46134": {
      "type": "Feature",
      "properties": {
        "wmo_synop_id-value": "46134",
        "obs_date_tm": "2026-04-23T07:14:00.000Z"
      }
    },
    "99999": null
  }
}
```

## 4) Get Raw Data for One Station in a 15m Window

Script: `scripts/get-station-15m-window-raw.js`

Fetches one 15-minute realtime window and returns all raw rows for a single station ID.

### Input

- `--station-id`: required station WMO ID
- `--iteration`: required positive integer
  - `1` = `now-15m..now`
  - `2` = `now-30m..now-15m`
- `--out`: optional output file

### Run

```bash
node scripts/get-station-15m-window-raw.js --station-id 46134 --iteration 1
```

Write output to file:

```bash
node scripts/get-station-15m-window-raw.js --station-id 46134 --iteration 2 --out station-46134-iteration-2.json
```

### Output Shape

```json
{
  "metadata": {
    "stationId": "46134",
    "iteration": 1,
    "anchorNow": "2026-04-23T07:20:00Z",
    "windowStart": "2026-04-23T07:05:00Z",
    "windowEnd": "2026-04-23T07:20:00Z",
    "numberMatched": 3821,
    "numberReturned": 3821,
    "stationFeatureCount": 4,
    "rowsWithTimestamp": 4,
    "hasNextLink": false,
    "realtimeUrl": "https://api.weather.gc.ca/collections/swob-realtime/items?..."
  },
  "features": [
    {
      "type": "Feature",
      "properties": {
        "wmo_synop_id-value": "46134",
        "obs_date_tm": "2026-04-23T07:14:00.000Z"
      }
    }
  ]
}
```

## 5) Get Raw Data for One Station Over N Minutes

Script: `scripts/get-station-range-raw.js`

Accepts a minute range, runs enough 15-minute chunk pulls to cover at least that range, then trims all rows to exactly `now-N minutes .. now`.

### Input

- `--station-id`: required station WMO ID
- `--minutes`: required positive integer
- `--out`: optional output file

### Run

```bash
node scripts/get-station-range-raw.js --station-id 46134 --minutes 20
node scripts/get-station-range-raw.js --station-id 46134 --minutes 60
node scripts/get-station-range-raw.js --station-id 46134 --minutes 180
```

Write output to file:

```bash
node scripts/get-station-range-raw.js --station-id 46134 --minutes 60 --out station-46134-range-60m.json
```

### Behavior

- Computes exact requested range: `now-N minutes .. now`
- Computes `windowsTried = ceil(N / 15)`
- Invokes 15-minute pulls for each needed iteration
- Aggregates all raw rows then trims by timestamp:
  - primary timestamp: `obs_date_tm`
  - fallback timestamp: `date_tm-value`
- Emits warning count when any chunk response includes a `next` link

### Output Shape

```json
{
  "metadata": {
    "stationId": "46134",
    "requestedMinutes": 20,
    "chunkMinutes": 15,
    "windowsTried": 2,
    "targetWindowStart": "2026-04-23T07:00:00Z",
    "targetWindowEnd": "2026-04-23T07:20:00Z",
    "coveredMinutesBeforeTrim": 30,
    "aggregatedRawCount": 7,
    "trimmedFeatureCount": 5,
    "nextLinkWarnings": 0
  },
  "windows": [
    {
      "iteration": 1,
      "windowStart": "2026-04-23T07:05:00Z",
      "windowEnd": "2026-04-23T07:20:00Z",
      "rawMatchCount": 4,
      "hasNextLink": false
    },
    {
      "iteration": 2,
      "windowStart": "2026-04-23T06:50:00Z",
      "windowEnd": "2026-04-23T07:05:00Z",
      "rawMatchCount": 3,
      "hasNextLink": false
    }
  ],
  "features": [
    {
      "type": "Feature",
      "properties": {
        "wmo_synop_id-value": "46134",
        "obs_date_tm": "2026-04-23T07:01:00.000Z"
      }
    }
  ]
}
```

## Live Integration Tests

Run live script tests (requires internet access):

```bash
node --test scripts/tests/live-integration.test.js
```
