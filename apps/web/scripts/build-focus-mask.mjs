/**
 * Bitmasks for India and Germany on the same 0.5° grid as the land mask.
 * Usage: node apps/web/scripts/build-focus-mask.mjs [geojson]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] || path.join(os.tmpdir(), "nivo-maps", "ne_50m_admin_0_countries.json");
const outFile = path.join(here, "..", "src", "components", "ui", "focus-mask.ts");
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
const wanted = ["India", "Germany"];
const features = Object.fromEntries(
  wanted.map((name) => {
    const feature = collection.features.find((item) => item.properties.NAME === name);
    return [name, { geometry: feature.geometry, box: bboxOf(feature.geometry) }];
  }),
);

function pointsFor(feature, step) {
  const pts = [];
  for (let lat = feature.box.south; lat <= feature.box.north; lat += step) {
    for (let lon = feature.box.west; lon <= feature.box.east; lon += step) {
      if (!pointInGeometry(lon, lat, feature.geometry)) continue;
      pts.push(Math.round(lon * 100), Math.round(lat * 100));
    }
  }
  return pts;
}

const india = pointsFor(features.India, 0.28);
const germany = pointsFor(features.Germany, 0.16);
const file = `/** Country dots from Natural Earth 50m, hundredths of a degree [lon, lat, ...]. */\nexport const INDIA_DOTS = [${india.join(",")}];\nexport const GERMANY_DOTS = [${germany.join(",")}];\n`;
fs.writeFileSync(outFile, file);
console.log(`india ${india.length / 2}, germany ${germany.length / 2}`);
