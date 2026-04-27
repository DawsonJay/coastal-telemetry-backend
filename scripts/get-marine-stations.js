#!/usr/bin/env node

const fs = require("node:fs/promises");

const STATIONS_URL =
  "https://api.weather.gc.ca/collections/swob-marine-stations/items?f=json&limit=100";

function parseArgs(argv) {
  const args = { out: null };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      args.out = argv[i + 1] ?? null;
      i += 1;
    }
  }

  return args;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status} ${response.statusText}): ${url}`);
  }
  return response.json();
}

function mapStations(features) {
  return features
    .map((feature) => {
      const id = feature?.properties?.wmo_id;
      const coords = feature?.geometry?.coordinates;
      if (!id || !Array.isArray(coords) || coords.length < 2) {
        return null;
      }

      return {
        id: String(id),
        location: {
          latitude: coords[1],
          longitude: coords[0],
        },
      };
    })
    .filter(Boolean);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await fetchJson(STATIONS_URL);
  const stations = mapStations(payload.features ?? []);
  const output = JSON.stringify(stations, null, 2);

  if (args.out) {
    await fs.writeFile(args.out, output, "utf8");
    process.stdout.write(`Wrote ${stations.length} stations to ${args.out}\n`);
    return;
  }

  process.stdout.write(output + "\n");
}

main().catch((error) => {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
});
