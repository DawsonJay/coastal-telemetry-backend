#!/usr/bin/env node

const fs = require("node:fs/promises");

const REALTIME_BASE_URL = "https://api.weather.gc.ca/collections/swob-realtime/items";
const WINDOW_MINUTES = 15;
const LIMIT = 10000;

function parseArgs(argv) {
  const args = { stationId: null, iteration: null, out: null, anchorNowIso: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--station-id") {
      args.stationId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--iteration") {
      args.iteration = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--anchor-now-iso") {
      args.anchorNowIso = argv[i + 1] ?? null;
      i += 1;
    }
  }

  return args;
}

function parseStationId(raw) {
  const stationId = String(raw ?? "").trim();
  if (!stationId) {
    throw new Error("`--station-id` is required and must be non-empty.");
  }
  return stationId;
}

function parseIteration(rawValue) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("`--iteration` must be a positive integer (1, 2, 3, ...).");
  }
  return value;
}

function parseAnchorNow(rawIso) {
  if (!rawIso) {
    return new Date();
  }
  const parsed = new Date(rawIso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("`--anchor-now-iso` must be a valid ISO datetime string.");
  }
  return parsed;
}

function toIsoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function computeWindow(iteration, anchorNow) {
  const end = new Date(anchorNow.getTime() - (iteration - 1) * WINDOW_MINUTES * 60_000);
  const start = new Date(end.getTime() - WINDOW_MINUTES * 60_000);
  return { start, end };
}

function getFeatureTimestampMs(feature) {
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

  return null;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response.json();
}

function buildRealtimeUrl(start, end) {
  const params = new URLSearchParams({
    f: "json",
    limit: String(LIMIT),
    datetime: `${toIsoUtc(start)}/${toIsoUtc(end)}`,
  });
  return `${REALTIME_BASE_URL}?${params.toString()}`;
}

function hasNextLink(payload) {
  return (payload.links ?? []).some((link) => link?.rel === "next");
}

function filterStationFeatures(features, stationId) {
  return (features ?? []).filter((feature) => {
    const featureStationId = feature?.properties?.["wmo_synop_id-value"];
    return featureStationId !== undefined && featureStationId !== null && String(featureStationId) === stationId;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stationId = parseStationId(args.stationId);
  const iteration = parseIteration(args.iteration);
  const anchorNow = parseAnchorNow(args.anchorNowIso);
  const { start, end } = computeWindow(iteration, anchorNow);

  const realtimeUrl = buildRealtimeUrl(start, end);
  const payload = await fetchJson(realtimeUrl);
  const features = filterStationFeatures(payload.features, stationId);
  const rowsWithTimestamp = features.filter((feature) => getFeatureTimestampMs(feature) !== null).length;

  if (hasNextLink(payload)) {
    process.stderr.write(
      "Warning: realtime response contains a `next` link; results may exceed single-page limits.\n",
    );
  }

  const outputPayload = {
    metadata: {
      stationId,
      iteration,
      anchorNow: toIsoUtc(anchorNow),
      windowStart: toIsoUtc(start),
      windowEnd: toIsoUtc(end),
      numberMatched: payload.numberMatched ?? null,
      numberReturned: payload.numberReturned ?? null,
      stationFeatureCount: features.length,
      rowsWithTimestamp,
      hasNextLink: hasNextLink(payload),
      realtimeUrl,
    },
    features,
  };

  const output = JSON.stringify(outputPayload, null, 2);

  if (args.out) {
    await fs.writeFile(args.out, output, "utf8");
    process.stdout.write(`Wrote ${features.length} station rows to ${args.out}\n`);
    return;
  }

  process.stdout.write(output + "\n");
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
