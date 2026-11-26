import { GERMANY_DOTS, INDIA_DOTS } from "./focus-mask";
import { LAND_COLS, LAND_MASK, LAND_ROWS } from "./land-mask";

export type Vec3 = [number, number, number];

const MASK = Uint8Array.from(atob(LAND_MASK), (char) => char.charCodeAt(0));
const RAD = Math.PI / 180;

/** Unit vector. +y is north, +z is the lon 0 meridian. */
export function toVec(lon: number, lat: number): Vec3 {
  const λ = lon * RAD;
  const φ = lat * RAD;
  const c = Math.cos(φ);
  return [c * Math.sin(λ), Math.sin(φ), c * Math.cos(λ)];
}

/** Yaw brings that longitude to the front. Positive tilt tips the north pole toward the camera. */
export function rotate([x, y, z]: Vec3, yaw: number, tilt: number): Vec3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  return [x1, y * ct - z1 * st, y * st + z1 * ct];
}

export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const theta = Math.acos(dot);
  if (theta < 1e-5) return a;
  const s = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / s;
  const w2 = Math.sin(t * theta) / s;
  return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
}

export type LandDot = { v: Vec3; focus: boolean };

const dotCache = new Map<number, LandDot[]>();

function cellKey(lon: number, lat: number) {
  return (Math.round(lon * 5) + 900) * 4000 + Math.round(lat * 5) + 450;
}

/**
 * Even land samples so small neighbours (Sri Lanka, the Gulf) still appear,
 * plus a denser orange set for India and Germany. `stride` skips cells on the 0.5° grid.
 */
export function landDots(stride: number): LandDot[] {
  const cached = dotCache.get(stride);
  if (cached) return cached;
  const claimed = new Set<number>();
  const out: LandDot[] = [];
  const addFocus = (pairs: readonly number[]) => {
    for (let i = 0; i < pairs.length; i += 2) {
      const lon = pairs[i] / 100;
      const lat = pairs[i + 1] / 100;
      claimed.add(cellKey(lon, lat));
      out.push({ v: toVec(lon, lat), focus: true });
    }
  };
  addFocus(INDIA_DOTS);
  addFocus(GERMANY_DOTS);
  const step = Math.max(2, stride);
  for (let row = 0; row < LAND_ROWS; row += step) {
    const lat = 90 - (row + 0.5) * (180 / LAND_ROWS);
    for (let col = 0; col < LAND_COLS; col += step) {
      const i = row * LAND_COLS + col;
      if ((MASK[i >> 3] & (1 << (i & 7))) === 0) continue;
      const lon = -180 + (col + 0.5) * (360 / LAND_COLS);
      if (claimed.has(cellKey(lon, lat))) continue;
      out.push({ v: toVec(lon, lat), focus: false });
    }
  }
  dotCache.set(stride, out);
  return out;
}

export type GlobeView = { cx: number; cy: number; r: number; yaw: number; tilt: number };

export function drawGlobe(
  ctx: CanvasRenderingContext2D,
  dots: readonly LandDot[],
  view: GlobeView,
  land: string,
  focus: string,
  dot: number,
) {
  const { cx, cy, r, yaw, tilt } = view;
  ctx.save();
  ctx.fillStyle = "rgb(28 26 23 / 0.028)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 1.03, r * 0.62, r * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgb(28 26 23 / 0.04)";
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.99, r * 0.4, r * 0.032, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const body = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.38, r * 0.05, cx + r * 0.08, cy + r * 0.12, r * 1.08);
  body.addColorStop(0, "rgb(248 245 240 / 0.22)");
  body.addColorStop(0.46, "rgb(228 221 210 / 0.4)");
  body.addColorStop(0.8, "rgb(196 186 172 / 0.62)");
  body.addColorStop(1, "rgb(148 138 124 / 0.78)");
  ctx.fillStyle = body;
  ctx.fill();

  ctx.save();
  ctx.clip();
  const size = Math.max(1.5, dot);
  const paint = (wantFocus: boolean) => {
    for (let i = 0; i < dots.length; i++) {
      const item = dots[i];
      if (item.focus !== wantFocus) continue;
      const [x, y, z] = rotate(item.v, yaw, tilt);
      if (z <= 0.02) continue;
      ctx.globalAlpha = item.focus ? 0.92 : 0.38 + z * 0.5;
      ctx.fillStyle = item.focus ? focus : land;
      const mark = item.focus ? size * 1.15 : size * 0.85;
      ctx.fillRect(cx + x * r, cy - y * r, mark, mark);
    }
  };
  paint(false);
  paint(true);
  ctx.restore();
  ctx.restore();
}
