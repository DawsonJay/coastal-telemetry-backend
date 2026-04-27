#!/usr/bin/env node

const fs = require("node:fs/promises");

const STATIONS_URL =
  "https://api.weather.gc.ca/collections/swob-marine-stations/items?f=json&limit=100";
const REALTIME_BASE_URL = "https://api.weather.gc.ca/collections/swob-realtime/items";
const ITERATION_MINUTES = 15;
const LIMIT = 10000;

function parseArgs(argv) {
  const args = { iteration: null, out: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--iteration") {
      args.iteration = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1] ?? null;
      i += 1;
    }
  }

  return args;
}

function parseIteration(rawValue) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("`--iteration` must be a positive integer (1, 2, 3, ...).");
  }
  return value;
}

function toIsoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function computeWindow(iteration) {
  const now = new Date();
  const end = new Date(now.getTime() - (iteration - 1) * ITERATION_MINUTES * 60_000);
  const start = new Date(end.getTime() - ITERATION_MINUTES * 60_000);
  return { start, end };
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response.json();
}

function buildMarineWmoIdSet(stationsPayload) {
  const ids = new Set();
  for (const feature of stationsPayload.features ?? []) {
    const id = feature?.properties?.wmo_id;
    if (id !== undefined && id !== null) {
      ids.add(String(id));
    }
  }
  return ids;
}

function buildRealtimeUrl(windowStart, windowEnd) {
  const params = new URLSearchParams({
    f: "json",
    limit: String(LIMIT),
    datetime: `${toIsoUtc(windowStart)}/${toIsoUtc(windowEnd)}`,
  });
  return `${REALTIME_BASE_URL}?${params.toString()}`;
}

function filterMarineFeatures(features, marineIds) {
  return (features ?? []).filter((feature) => {
    const wmo = feature?.properties?.["wmo_synop_id-value"];
    return wmo !== undefined && wmo !== null && marineIds.has(String(wmo));
  });
}

function hasNextLink(payload) {
  return (payload.links ?? []).some((link) => link?.rel === "next");
}

function getFeatureStationId(feature) {
  const stationId = feature?.properties?.["wmo_synop_id-value"];
  return stationId === undefined || stationId === null ? null : String(stationId);
}

function getFeatureTimestamp(feature) {
  const obsTime = feature?.properties?.obs_date_tm;
  if (obsTime) {
    const parsed = Date.parse(obsTime);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const fallback = feature?.properties?.["date_tm-value"];
  if (fallback) {
    const parsed = Date.parse(fallback);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return Number.NEGATIVE_INFINITY;
}

function buildLatestStationMap(features) {
  const latestByStation = {};
  const latestTsByStation = {};

  for (const feature of features ?? []) {
    const stationId = getFeatureStationId(feature);
    if (!stationId) {
      continue;
    }

    const ts = getFeatureTimestamp(feature);
    if (!(stationId in latestByStation) || ts > latestTsByStation[stationId]) {
      latestByStation[stationId] = feature;
      latestTsByStation[stationId] = ts;
    }
  }

  return latestByStation;
}

function buildCompleteStationMap(expectedStationIds, latestByStation) {
  const completeMap = {};
  for (const stationId of expectedStationIds) {
    completeMap[stationId] = latestByStation[stationId] ?? null;
  }
  return completeMap;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const iteration = parseIteration(args.iteration);
  const { start, end } = computeWindow(iteration);

  const stationsPayload = await fetchJson(STATIONS_URL);
  const marineIds = buildMarineWmoIdSet(stationsPayload);
  const marineStationIds = Array.from(marineIds);

  const realtimeUrl = buildRealtimeUrl(start, end);
  const realtimePayload = await fetchJson(realtimeUrl);

  const marineFeatures = filterMarineFeatures(realtimePayload.features, marineIds);
  const latestByStation = buildLatestStationMap(marineFeatures);
  const stations = buildCompleteStationMap(marineStationIds, latestByStation);
  const stationEntryCount = marineStationIds.length;
  const stationsWithDataCount = Object.values(stations).filter((entry) => entry !== null).length;
  const stationsWithoutDataCount = stationEntryCount - stationsWithDataCount;

  if (hasNextLink(realtimePayload)) {
    process.stderr.write(
      "Warning: realtime response contains a `next` link; results may exceed single-page limits.\n",
    );
  }

  const outputPayload = {
    metadata: {
      iteration,
      windowStart: toIsoUtc(start),
      windowEnd: toIsoUtc(end),
      numberMatched: realtimePayload.numberMatched ?? null,
      numberReturned: realtimePayload.numberReturned ?? null,
      marineStationCount: marineIds.size,
      marineFeatureCount: marineFeatures.length,
      stationEntryCount,
      latestStationCount: stationsWithDataCount,
      stationsWithDataCount,
      stationsWithoutDataCount,
      hasNextLink: hasNextLink(realtimePayload),
      realtimeUrl,
    },
    stations,
  };

  const output = JSON.stringify(outputPayload, null, 2);

  if (args.out) {
    await fs.writeFile(args.out, output, "utf8");
    process.stdout.write(
      `Wrote ${stationsWithDataCount} station records and ${stationsWithoutDataCount} null entries to ${args.out}\n`,
    );
    return;
  }

  process.stdout.write(output + "\n");
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
