#!/usr/bin/env node

const fs = require("node:fs/promises");

const REALTIME_BASE_URL = "https://api.weather.gc.ca/collections/swob-realtime/items";
const WINDOW_MINUTES = 15;
const MAX_LOOKBACK_MINUTES = 90;
const MAX_WINDOWS = MAX_LOOKBACK_MINUTES / WINDOW_MINUTES;
const LIMIT = 10000;

function parseArgs(argv) {
  const args = { stationIdsJson: null, out: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--station-ids-json") {
      args.stationIdsJson = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1] ?? null;
      i += 1;
    }
  }

  return args;
}

function parseStationIds(rawJson) {
  if (!rawJson) {
    throw new Error("Missing required argument: --station-ids-json");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("`--station-ids-json` must be valid JSON (array of station IDs).");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("`--station-ids-json` must be a JSON array.");
  }

  const normalized = parsed
    .map((id) => (id === null || id === undefined ? "" : String(id).trim()))
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new Error("Station ID array must contain at least one non-empty station ID.");
  }

  return Array.from(new Set(normalized));
}

function toIsoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function computeWindow(iteration) {
  const now = new Date();
  const end = new Date(now.getTime() - (iteration - 1) * WINDOW_MINUTES * 60_000);
  const start = new Date(end.getTime() - WINDOW_MINUTES * 60_000);
  return { start, end };
}

function buildRealtimeUrl(start, end) {
  const params = new URLSearchParams({
    f: "json",
    limit: String(LIMIT),
    datetime: `${toIsoUtc(start)}/${toIsoUtc(end)}`,
  });
  return `${REALTIME_BASE_URL}?${params.toString()}`;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response.json();
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

function filterRequestedStationFeatures(features, requestedSet) {
  return (features ?? []).filter((feature) => {
    const stationId = feature?.properties?.["wmo_synop_id-value"];
    return stationId !== undefined && stationId !== null && requestedSet.has(String(stationId));
  });
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
  const stationIds = parseStationIds(args.stationIdsJson);
  const requestedSet = new Set(stationIds);
  const coveredSet = new Set();

  const latestByStation = {};
  const latestTsByStation = {};
  const windowSummaries = [];
  let nextLinkWarnings = 0;

  for (let iteration = 1; iteration <= MAX_WINDOWS; iteration += 1) {
    const { start, end } = computeWindow(iteration);
    const realtimeUrl = buildRealtimeUrl(start, end);
    const payload = await fetchJson(realtimeUrl);
    const matchedFeatures = filterRequestedStationFeatures(payload.features, requestedSet);
    const nextLinkPresent = hasNextLink(payload);

    if (nextLinkPresent) {
      nextLinkWarnings += 1;
      process.stderr.write(
        `Warning: realtime response has a 'next' link for iteration ${iteration}; window may exceed single-page limits.\n`,
      );
    }

    for (const feature of matchedFeatures) {
      const stationId = getFeatureStationId(feature);
      if (!stationId) {
        continue;
      }

      coveredSet.add(stationId);

      const ts = getFeatureTimestamp(feature);
      if (!(stationId in latestByStation) || ts > latestTsByStation[stationId]) {
        latestByStation[stationId] = feature;
        latestTsByStation[stationId] = ts;
      }
    }

    windowSummaries.push({
      iteration,
      windowStart: toIsoUtc(start),
      windowEnd: toIsoUtc(end),
      rawMatchCount: matchedFeatures.length,
      numberMatched: payload.numberMatched ?? null,
      numberReturned: payload.numberReturned ?? null,
      hasNextLink: nextLinkPresent,
      realtimeUrl,
    });

    if (coveredSet.size === requestedSet.size) {
      break;
    }
  }

  const missingStationIds = stationIds.filter((id) => !coveredSet.has(id));
  const stations = buildCompleteStationMap(stationIds, latestByStation);
  const stationEntryCount = stationIds.length;
  const stationsWithDataCount = Object.values(stations).filter((entry) => entry !== null).length;
  const stationsWithoutDataCount = stationEntryCount - stationsWithDataCount;
  const nullStationCount = stationsWithoutDataCount;

  const outputPayload = {
    metadata: {
      requestedStationCount: stationIds.length,
      coveredStationCount: coveredSet.size,
      missingStationIds,
      stationEntryCount,
      latestStationCount: stationsWithDataCount,
      stationsWithDataCount,
      stationsWithoutDataCount,
      nullStationCount,
      windowsTried: windowSummaries.length,
      maxWindows: MAX_WINDOWS,
      maxLookbackMinutes: MAX_LOOKBACK_MINUTES,
      windowMinutes: WINDOW_MINUTES,
      nextLinkWarnings,
    },
    windows: windowSummaries,
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
