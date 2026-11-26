import { useEffect, useRef, type CSSProperties } from "react";
import { drawGlobe, landDots, rotate, slerp, toVec, type Vec3 } from "./globe";
import "./route-globe.css";

/**
 * A shaded dotted globe. India and Germany stay in front, a dashed arc joins them, and each
 * end carries its flag. Drag to turn it; it eases back onto that route when you let go.
 */

export type Place = { name: string; lon: number; lat: number; note?: string };

const MUSCAT: Place = { name: "Muscat", lon: 58.41, lat: 23.59 };
const DEST: Place[] = [
  { name: "London", lon: -0.13, lat: 51.5, note: "7h 45m" },
  { name: "Istanbul", lon: 28.98, lat: 41.01, note: "4h 50m" },
  { name: "Cairo", lon: 31.24, lat: 30.04, note: "4h 10m" },
  { name: "Nairobi", lon: 36.82, lat: -1.29, note: "5h 05m" },
  { name: "Zanzibar", lon: 39.2, lat: -6.16, note: "5h 30m" },
  { name: "Mumbai", lon: 72.88, lat: 19.08, note: "2h 55m" },
  { name: "Kathmandu", lon: 85.32, lat: 27.72, note: "4h 15m" },
  { name: "Bangkok", lon: 100.5, lat: 13.76, note: "6h 20m" },
  { name: "Kuala Lumpur", lon: 101.69, lat: 3.14, note: "7h 05m" },
  { name: "Manila", lon: 120.98, lat: 14.6, note: "8h 40m" },
];

export type GlobeTheme = {
  ground: string;
  land: string;
  arc: string;
  glow: string;
  text: string;
  muted: string;
};

type Props = {
  hub?: Place;
  places?: Place[];
  theme?: GlobeTheme;
  motion?: "full" | "reduced";
  className?: string;
  style?: CSSProperties;
};

function drawIndiaFlag(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number) {
  const band = (rad * 2) / 3;
  ctx.fillStyle = "#FF9933";
  ctx.fillRect(x - rad, y - rad, rad * 2, band);
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(x - rad, y - rad + band, rad * 2, band);
  ctx.fillStyle = "#138808";
  ctx.fillRect(x - rad, y - rad + band * 2, rad * 2, band + 1);
  const cr = rad * 0.3;
  ctx.strokeStyle = "#000080";
  ctx.fillStyle = "#000080";
  ctx.lineWidth = Math.max(0.6, rad * 0.045);
  ctx.beginPath();
  ctx.arc(x, y, cr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, cr * 0.16, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * cr * 0.2, y + Math.sin(a) * cr * 0.2);
    ctx.lineTo(x + Math.cos(a) * cr, y + Math.sin(a) * cr);
    ctx.stroke();
  }
}

function drawGermanyFlag(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number) {
  const band = (rad * 2) / 3;
  ctx.fillStyle = "#000000";
  ctx.fillRect(x - rad, y - rad, rad * 2, band);
  ctx.fillStyle = "#DD0000";
  ctx.fillRect(x - rad, y - rad + band, rad * 2, band);
  ctx.fillStyle = "#FFCE00";
  ctx.fillRect(x - rad, y - rad + band * 2, rad * 2, band + 1);
}

let planeIcon: Path2D | null = null;

function drawPlane(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  if (typeof Path2D === "undefined") return;
  if (!planeIcon) {
    planeIcon = new Path2D(
      "M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z",
    );
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle + Math.PI / 4);
  ctx.scale(0.78, 0.78);
  ctx.translate(-12, -12);
  ctx.fillStyle = "#FB770B";
  ctx.fill(planeIcon);
  ctx.restore();
}

function drawStop(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, globeR: number) {
  const kind = name === "India" ? "in" : name === "Germany" ? "de" : null;
  if (!kind) return;
  ctx.globalAlpha = 1;
  const rad = Math.max(9, Math.min(11, globeR * 0.046));
  ctx.save();
  ctx.shadowColor = "rgb(28 26 23 / 0.22)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.arc(x, y, rad + 2.2, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, Math.PI * 2);
  ctx.clip();
  if (kind === "in") drawIndiaFlag(ctx, x, y, rad);
  else drawGermanyFlag(ctx, x, y, rad);
  ctx.restore();

  ctx.beginPath();
  ctx.arc(x, y, rad + 1.4, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.font = "600 11px Poppins, sans-serif";
  const label = name;
  const padX = 6;
  const textW = ctx.measureText(label).width;
  const pillW = textW + padX * 2;
  const pillH = 16;
  const above = y - rad - pillH - 10 > 4;
  const py = above ? y - rad - pillH - 8 : y + rad + 8;
  const px = Math.round(x - pillW / 2);
  ctx.save();
  ctx.shadowColor = "rgb(28 26 23 / 0.12)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.roundRect(px, py, pillW, pillH, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#1C1A17";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px + padX, py + pillH / 2 + 0.5);
}

const NIGHT: GlobeTheme = {
  ground: "#06080d",
  land: "#9fb4d6",
  arc: "#ffb547",
  glow: "rgb(90 140 255 / 0.18)",
  text: "#eef2fb",
  muted: "#7c8aa5",
};

export function RouteGlobe({
  hub = MUSCAT,
  places = DEST,
  theme = NIGHT,
  motion = "full",
  className = "",
  style,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = host.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = cv.getContext("2d");
    } catch {
      return;
    }
    if (!ctx) return;
    const reduced =
      motion === "reduced" ||
      (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const dots = landDots(window.innerWidth < 640 ? 5 : 4);
    const H = toVec(hub.lon, hub.lat);
    const routes = places.map((p) => ({
      p,
      v: toVec(p.lon, p.lat),
    }));
    const RAD = Math.PI / 180;
    const yawIndia = hub.lon * RAD;
    const yawGermany = (places[0]?.lon ?? hub.lon) * RAD;
    const yawMid = (yawIndia + yawGermany) / 2;
    const reach = Math.min(Math.abs(yawIndia - yawGermany) * 0.22, 14 * RAD);
    const yawFrom = yawMid + Math.sign(yawIndia - yawMid) * reach;
    const yawTo = yawMid + Math.sign(yawGermany - yawMid) * reach;
    const restTilt = 12 * RAD;
    const st = {
      yaw: yawFrom,
      tilt: restTilt,
      drag: false,
      px: 0,
      py: 0,
      released: 0,
    };
    const pose = (now: number) => {
      if (reduced) return { yaw: (yawFrom + yawTo) / 2, flight: 0.55, show: 1 };
      const cycle = 12;
      const u = (((now - t0) / 1000) % cycle) / cycle;
      const smooth = (x: number) => {
        const t = Math.max(0, Math.min(1, x));
        return t * t * (3 - 2 * t);
      };
      if (u < 0.08) return { yaw: yawFrom, flight: 0, show: 1 };
      if (u < 0.6) {
        const k = smooth((u - 0.08) / 0.52);
        return { yaw: yawFrom + (yawTo - yawFrom) * k, flight: k, show: 1 };
      }
      if (u < 0.72) return { yaw: yawTo, flight: 1, show: 1 };
      const k = smooth((u - 0.72) / 0.28);
      const show = 1 - smooth((u - 0.72) / 0.1);
      return { yaw: yawTo + (yawFrom - yawTo) * k, flight: 1, show };
    };
    let W = 0;
    let Hh = 0;
    let dpr = 1;
    let raf = 0;
    let alive = true;
    let visible = true;
    const t0 = performance.now();

    const size = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = el.clientWidth;
      Hh = el.clientHeight;
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(Hh * dpr);
    };
    const project = (v: Vec3, lift: number, r: number, cx: number, cy: number) => {
      const [x, y, z] = rotate(v, st.yaw, st.tilt);
      return { x: cx + x * r * lift, y: cy - y * r * lift, z };
    };

    const draw = (now: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, Hh);
      const r = Math.min(W, Hh) * 0.4;
      const cx = W / 2;
      const cy = Hh / 2;
      drawGlobe(ctx, dots, { cx, cy, r, yaw: st.yaw, tilt: st.tilt }, theme.land, theme.arc, Math.max(1.7, r / 145));
      const posed = pose(now);
      const flight = posed.flight;
      ctx.lineCap = "round";
      const hubPt = project(H, 1.02, r, cx, cy);
      let craft: { x: number; y: number; angle: number; z: number } | null = null;
      for (const rt of routes) {
        const ang = Math.acos(Math.max(-1, Math.min(1, H[0] * rt.v[0] + H[1] * rt.v[1] + H[2] * rt.v[2])));
        const height = 0.045 + ang * 0.08;
        const pts: { x: number; y: number; z: number }[] = [];
        for (let k = 0; k <= 48; k++) {
          const u = k / 48;
          pts.push(project(slerp(H, rt.v, u), 1 + Math.sin(Math.PI * u) * height, r, cx, cy));
        }
        ctx.strokeStyle = theme.arc;
        ctx.lineWidth = 1.6;
        ctx.setLineDash([2.2, 5.5]);
        ctx.lineDashOffset = -flight * 70;
        ctx.globalAlpha = 0.9;
        for (let k = 0; k < 48; k++) {
          const a = pts[k];
          const b = pts[k + 1];
          if (a.z < 0.02 && b.z < 0.02) continue;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (posed.show > 0.02) {
          const along = Math.max(0, Math.min(1, flight)) * 48;
          const i = Math.min(47, Math.floor(along));
          const frac = along - i;
          const a = pts[i];
          const b = pts[i + 1];
          craft = {
            x: a.x + (b.x - a.x) * frac,
            y: a.y + (b.y - a.y) * frac,
            angle: Math.atan2(b.y - a.y, b.x - a.x),
            z: a.z,
          };
        }
      }
      if (craft && craft.z > 0.02) {
        ctx.save();
        ctx.globalAlpha = posed.show;
        drawPlane(ctx, craft.x, craft.y, craft.angle);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for (const rt of routes) {
        const end = project(rt.v, 1.02, r, cx, cy);
        if (end.z > 0.08) drawStop(ctx, rt.p.name, end.x, end.y - 8, r);
      }
      if (hubPt.z > 0.08) drawStop(ctx, hub.name, hubPt.x, hubPt.y, r);
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!alive || !visible || document.hidden) return;
      if (!st.drag) {
        const target = pose(now);
        if (st.released) {
          const k = Math.min(1, (now - st.released) / 700);
          const step = 0.12 + 0.4 * k;
          let dyaw = target.yaw - st.yaw;
          dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
          st.yaw += dyaw * step;
          st.tilt += (restTilt - st.tilt) * step;
          if (k >= 1) st.released = 0;
        } else {
          st.yaw = target.yaw;
          st.tilt = restTilt;
        }
      }
      draw(now);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (reduced) return draw(performance.now());
      if (!raf && alive) raf = requestAnimationFrame(tick);
    };
    const onDown = (e: PointerEvent) => {
      try {
        cv.setPointerCapture(e.pointerId);
      } catch {
        /* A pointer that is already gone should not block the drag. */
      }
      st.drag = true;
      st.px = e.clientX;
      st.py = e.clientY;
      el.dataset.dragging = "";
    };
    const onMove = (e: PointerEvent) => {
      if (st.drag) {
        const r = Math.min(W, Hh) * 0.4;
        const dx = e.clientX - st.px;
        const dy = e.clientY - st.py;
        st.px = e.clientX;
        st.py = e.clientY;
        st.yaw -= dx / r;
        st.tilt = Math.max(-0.9, Math.min(0.9, st.tilt + dy / r));
        if (reduced) draw(performance.now());
      }
    };
    const onUp = () => {
      st.drag = false;
      st.released = performance.now();
      delete el.dataset.dragging;
    };
    cv.addEventListener("pointerdown", onDown);
    cv.addEventListener("pointermove", onMove);
    cv.addEventListener("pointerup", onUp);
    cv.addEventListener("pointercancel", onUp);
    const ro = new ResizeObserver(() => {
      size();
      draw(performance.now());
    });
    ro.observe(el);
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
    });
    io.observe(el);
    const onVis = () => {
      if (!document.hidden) start();
    };
    document.addEventListener("visibilitychange", onVis);
    size();
    start();
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("pointercancel", onUp);
    };
  }, [hub, places, theme, motion]);

  const routeWord = places.length === 1 ? "route" : "routes";

  return (
    <div
      ref={host}
      className={`rg ${className}`}
      style={{
        background: theme.ground,
        color: theme.text,
        ["--rg-muted" as string]: theme.muted,
        ["--rg-arc" as string]: theme.arc,
        ["--rg-ground" as string]: theme.ground === "transparent" ? "#f3f1ec" : theme.ground,
        ...style,
      }}
    >
      <canvas
        ref={canvas}
        className="rg__canvas"
        role="img"
        aria-label={`A globe with ${places.length} flight ${routeWord} from ${hub.name}`}
      />
      <ul className="rg__sr">
        {places.map((p) => (
          <li key={p.name}>
            {hub.name} to {p.name}
            {p.note ? `, ${p.note}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default RouteGlobe;
