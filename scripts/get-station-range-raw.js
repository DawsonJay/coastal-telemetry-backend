#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const WINDOW_MINUTES = 15;

function parseArgs(argv) {
  const args = { stationId: null, minutes: null, out: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--station-id") {
      args.stationId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--minutes") {
      args.minutes = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--out") {
      args.out = argv[i + 1] ?? null;
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

function parseMinutes(rawValue) {
  const value = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("`--minutes` must be a positive integer.");
  }
  return value;
}

function toIsoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
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

function normalizeFeature(feature) {
  const ts = getFeatureTimestampMs(feature);
  return { feature, timestampMs: ts };
}

function withinRange(timestampMs, startMs, endMs) {
  if (timestampMs === null) {
    return false;
  }
  return timestampMs >= startMs && timestampMs <= endMs;
}

async function run15mScript(scriptPath, stationId, iteration, anchorNowIso) {
  const { stdout, stderr } = await execFileAsync(
    "node",
    [scriptPath, "--station-id", stationId, "--iteration", String(iteration), "--anchor-now-iso", anchorNowIso],
    {
      maxBuffer: 1024 * 1024 * 120,
    },
  );

  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error(`No JSON output from 15-minute script for iteration ${iteration}`);
  }

  return { payload: JSON.parse(trimmed), stderr: stderr.trim() };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stationId = parseStationId(args.stationId);
  const requestedMinutes = parseMinutes(args.minutes);

  const anchorNow = new Date();
  const anchorNowIso = toIsoUtc(anchorNow);
  const targetRangeEnd = anchorNow;
  const targetRangeStart = new Date(anchorNow.getTime() - requestedMinutes * 60_000);
  const targetStartMs = targetRangeStart.getTime();
  const targetEndMs = targetRangeEnd.getTime();

  const chunkCount = Math.ceil(requestedMinutes / WINDOW_MINUTES);
  const script15mPath = path.resolve(__dirname, "get-station-15m-window-raw.js");

  const windows = [];
  const allFeatures = [];
  let nextLinkWarnings = 0;

  for (let iteration = 1; iteration <= chunkCount; iteration += 1) {
    const { payload, stderr } = await run15mScript(script15mPath, stationId, iteration, anchorNowIso);
    const features = payload.features ?? [];
    allFeatures.push(...features);

    if (stderr.includes("next")) {
      nextLinkWarnings += 1;
    }

    windows.push({
      iteration,
      windowStart: payload.metadata?.windowStart ?? null,
      windowEnd: payload.metadata?.windowEnd ?? null,
      rawMatchCount: features.length,
      rowsWithTimestamp: payload.metadata?.rowsWithTimestamp ?? 0,
      hasNextLink: payload.metadata?.hasNextLink ?? false,
      realtimeUrl: payload.metadata?.realtimeUrl ?? null,
    });
  }

  const normalized = allFeatures.map(normalizeFeature);
  const inRange = normalized
    .filter(({ timestampMs }) => withinRange(timestampMs, targetStartMs, targetEndMs))
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .map(({ feature }) => feature);

  const outputPayload = {
    metadata: {
      stationId,
      requestedMinutes,
      chunkMinutes: WINDOW_MINUTES,
      windowsTried: chunkCount,
      targetWindowStart: toIsoUtc(targetRangeStart),
      targetWindowEnd: toIsoUtc(targetRangeEnd),
      coveredMinutesBeforeTrim: chunkCount * WINDOW_MINUTES,
      aggregatedRawCount: allFeatures.length,
      trimmedFeatureCount: inRange.length,
      nextLinkWarnings,
      anchorNow: anchorNowIso,
    },
    windows,
    features: inRange,
  };

  const output = JSON.stringify(outputPayload, null, 2);

  if (args.out) {
    await fs.writeFile(args.out, output, "utf8");
    process.stdout.write(`Wrote ${inRange.length} station rows to ${args.out}\n`);
    return;
  }

  process.stdout.write(output + "\n");
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
