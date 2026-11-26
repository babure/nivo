/**
 * Builds a 0.5° land bitmask from Natural Earth 50m admin-0 countries.
 * Usage: node apps/web/scripts/build-land-mask.mjs [geojson]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] || path.join(os.tmpdir(), "nivo-maps", "ne_50m_admin_0_countries.json");
const outFile = path.join(here, "..", "src", "components", "ui", "land-mask.ts");
const COLS = 720;
const ROWS = 360;

function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lon, lat, geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    if (!pointInRing(lon, lat, polygon[0])) continue;
    let hole = false;
    for (let h = 1; h < polygon.length; h++) {
      if (pointInRing(lon, lat, polygon[h])) {
        hole = true;
        break;
      }
    }
    if (!hole) return true;
  }
  return false;
}

function bboxOf(geometry) {
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const polygon of polygons) {
    for (const [lon, lat] of polygon[0]) {
      if (lon < west) west = lon;
      if (lon > east) east = lon;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
    }
  }
  return { west, east, south, north };
}

const collection = JSON.parse(fs.readFileSync(source, "utf8"));
const features = collection.features
  .filter((feature) => feature.geometry && (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon"))
  .map((feature) => ({ geometry: feature.geometry, box: bboxOf(feature.geometry) }));

const bytes = new Uint8Array((COLS * ROWS) >> 3);
let land = 0;
for (let row = 0; row < ROWS; row++) {
  const lat = 90 - (row + 0.5) * (180 / ROWS);
  for (let col = 0; col < COLS; col++) {
    const lon = -180 + (col + 0.5) * (360 / COLS);
    const hit = features.some(
      (feature) =>
        lon >= feature.box.west &&
        lon <= feature.box.east &&
        lat >= feature.box.south &&
        lat <= feature.box.north &&
        pointInGeometry(lon, lat, feature.geometry),
    );
    if (!hit) continue;
    const i = row * COLS + col;
    bytes[i >> 3] |= 1 << (i & 7);
    land++;
  }
}

const b64 = Buffer.from(bytes).toString("base64");
const file = `/** Land bitmask from Natural Earth 50m admin-0 countries (public domain). 0.5° cells, ${COLS}×${ROWS}. */\nexport const LAND_COLS = ${COLS};\nexport const LAND_ROWS = ${ROWS};\nexport const LAND_MASK = "${b64}";\n`;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, file);
console.log(`land cells ${land}, wrote ${outFile}`);
