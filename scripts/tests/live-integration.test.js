const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const SCRIPTS_DIR = path.resolve(ROOT_DIR, "scripts");

async function runScript(scriptName, args = []) {
  const scriptPath = path.resolve(SCRIPTS_DIR, scriptName);
  const { stdout, stderr } = await execFileAsync("node", [scriptPath, ...args], {
    cwd: ROOT_DIR,
    maxBuffer: 1024 * 1024 * 100,
  });

  const trimmed = stdout.trim();
  assert.ok(trimmed.length > 0, `${scriptName} returned empty stdout`);
  return { payload: JSON.parse(trimmed), stderr: stderr.trim() };
}

function stationIdsFromMap(stationsMap) {
  return Object.keys(stationsMap ?? {});
}

function assertStationKeyMatchesEntry(stationId, entry) {
  if (entry === null) {
    return;
  }

  assert.equal(entry?.type, "Feature");
  assert.equal(String(entry?.properties?.["wmo_synop_id-value"]), stationId);
  const hasObs = !!entry?.properties?.obs_date_tm;
  const hasFallback = !!entry?.properties?.["date_tm-value"];
  assert.ok(hasObs || hasFallback, `station ${stationId} missing both recency fields`);
}

function getFeatureTimestampMs(feature) {
  const obs = feature?.properties?.obs_date_tm;
  if (obs) {
    const parsed = Date.parse(obs);
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

test("get-marine-15m-window-raw emits one entry per marine station ID", { timeout: 90_000 }, async () => {
  const { payload: stationsPayload } = await runScript("get-marine-stations.js");
  const expectedIds = new Set(stationsPayload.map((station) => String(station.id)));
  assert.ok(expectedIds.size > 0, "Expected non-empty marine station list");

  const { payload: realtimePayload } = await runScript("get-marine-15m-window-raw.js", [
    "--iteration",
    "1",
  ]);

  const actualIds = stationIdsFromMap(realtimePayload.stations);
  assert.equal(actualIds.length, expectedIds.size, "Station map key count should match station list");

  for (const stationId of actualIds) {
    assert.ok(expectedIds.has(stationId), `Unexpected station ID in map: ${stationId}`);
    assertStationKeyMatchesEntry(stationId, realtimePayload.stations[stationId]);
  }

  assert.equal(realtimePayload.metadata.stationEntryCount, expectedIds.size);
  assert.equal(
    realtimePayload.metadata.stationsWithDataCount + realtimePayload.metadata.stationsWithoutDataCount,
    expectedIds.size,
  );
});

test(
  "get-stations-coverage-90m-raw preserves all requested IDs and uses null for missing",
  { timeout: 90_000 },
  async () => {
    const requestedIds = ["71435", "99999"];
    const { payload } = await runScript("get-stations-coverage-90m-raw.js", [
      "--station-ids-json",
      JSON.stringify(requestedIds),
    ]);

    const actualIds = stationIdsFromMap(payload.stations).sort();
    const expectedSorted = [...requestedIds].sort();
    assert.deepEqual(actualIds, expectedSorted);

    for (const stationId of actualIds) {
      assertStationKeyMatchesEntry(stationId, payload.stations[stationId]);
    }

    assert.equal(payload.metadata.stationEntryCount, requestedIds.length);
    assert.equal(payload.metadata.requestedStationCount, requestedIds.length);
    assert.equal(
      payload.metadata.stationsWithDataCount + payload.metadata.stationsWithoutDataCount,
      requestedIds.length,
    );
    assert.equal(payload.metadata.nullStationCount, payload.metadata.stationsWithoutDataCount);
    assert.ok(payload.metadata.windowsTried >= 1 && payload.metadata.windowsTried <= 6);
  },
);

test("get-station-15m-window-raw returns metadata and station-only rows", { timeout: 90_000 }, async () => {
  const { payload: stationsPayload } = await runScript("get-marine-stations.js");
  assert.ok(Array.isArray(stationsPayload) && stationsPayload.length > 0, "Expected marine stations");
  const stationId = String(stationsPayload[0].id);

  const { payload } = await runScript("get-station-15m-window-raw.js", [
    "--station-id",
    stationId,
    "--iteration",
    "1",
  ]);

  assert.equal(payload.metadata.stationId, stationId);
  assert.equal(payload.metadata.iteration, 1);
  assert.ok(typeof payload.metadata.windowStart === "string");
  assert.ok(typeof payload.metadata.windowEnd === "string");
  assert.ok(Array.isArray(payload.features));
  assert.equal(payload.metadata.stationFeatureCount, payload.features.length);

  for (const feature of payload.features) {
    assert.equal(feature?.type, "Feature");
    assert.equal(String(feature?.properties?.["wmo_synop_id-value"]), stationId);
  }
});

test("get-station-range-raw trims to exact requested range", { timeout: 120_000 }, async () => {
  const { payload: stationsPayload } = await runScript("get-marine-stations.js");
  assert.ok(Array.isArray(stationsPayload) && stationsPayload.length > 0, "Expected marine stations");
  const stationId = String(stationsPayload[0].id);

  const { payload } = await runScript("get-station-range-raw.js", [
    "--station-id",
    stationId,
    "--minutes",
    "20",
  ]);

  assert.equal(payload.metadata.stationId, stationId);
  assert.equal(payload.metadata.requestedMinutes, 20);
  assert.equal(payload.metadata.chunkMinutes, 15);
  assert.equal(payload.metadata.windowsTried, 2);
  assert.ok(payload.metadata.coveredMinutesBeforeTrim >= 20);
  assert.ok(payload.metadata.aggregatedRawCount >= payload.metadata.trimmedFeatureCount);
  assert.ok(Array.isArray(payload.windows));
  assert.equal(payload.windows.length, 2);
  assert.ok(Array.isArray(payload.features));

  const startMs = Date.parse(payload.metadata.targetWindowStart);
  const endMs = Date.parse(payload.metadata.targetWindowEnd);
  assert.ok(!Number.isNaN(startMs) && !Number.isNaN(endMs), "Range metadata must be valid ISO datetimes");

  for (const feature of payload.features) {
    assert.equal(String(feature?.properties?.["wmo_synop_id-value"]), stationId);
    const ts = getFeatureTimestampMs(feature);
    assert.ok(ts !== null, "Each range feature must include a parseable timestamp");
    assert.ok(ts >= startMs, "Feature timestamp must be >= requested start");
    assert.ok(ts <= endMs, "Feature timestamp must be <= requested end");
  }
});
