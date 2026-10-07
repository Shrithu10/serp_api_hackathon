import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import land110 from "world-atlas/land-110m.json";
import countries110 from "world-atlas/countries-110m.json";
import type { Analysis, VStatus, Vantage } from "../lib/types";
import { groupColor as vantageColor } from "../lib/palette";

type LngLat = [number, number];

interface Dots {
  world: LngLat[];
  india: LngLat[];
}

let DOTS: Dots | null = null;

/** Sample land on a lat/lng grid once; India gets a much finer grid. */
function buildDots(): Dots {
  if (DOTS) return DOTS;
  const topoLand = land110 as unknown as Topology;
  const topoC = countries110 as unknown as Topology;
  const landGeo = feature(topoLand, topoLand.objects.land) as unknown as d3.GeoPermissibleObjects;
  const all = feature(topoC, topoC.objects.countries) as unknown as GeoJSON.FeatureCollection;
  const india = all.features.find((f) => String(f.id) === "356") as d3.GeoPermissibleObjects;
  const world: LngLat[] = [];
  for (let lat = -58; lat <= 80; lat += 1.9) {
    const step = 1.9 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
    for (let lng = -180; lng < 180; lng += step) {
      if (d3.geoContains(landGeo, [lng, lat])) world.push([lng, lat]);
    }
  }
  const ind: LngLat[] = [];
  for (let lat = 6; lat <= 37.5; lat += 0.42) {
    for (let lng = 67; lng <= 98; lng += 0.42) {
      if (d3.geoContains(india, [lng, lat])) ind.push([lng, lat]);
    }
  }
  DOTS = { world, india: ind };
  return DOTS;
}

interface Props {
  vantages: Vantage[];
  statuses?: Record<string, VStatus>;
  analysis?: Analysis | null;
  focus: "india" | "world";
  selected?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  interactive?: boolean;
  intensity?: number;
  labels?: boolean;
}

export default function DotGlobe({ vantages, statuses = {}, analysis, focus, selected, onSelect, className, interactive = true, intensity = 1, labels = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const live = useRef({ vantages, statuses, analysis, focus, selected, intensity, labels });
  live.current = { vantages, statuses, analysis, focus, selected, intensity, labels };
  const arrived = useRef<Record<string, number>>({});

  useEffect(() => {
    for (const [id, s] of Object.entries(statuses)) {
      if (s !== "pending" && !arrived.current[id]) arrived.current[id] = performance.now();
      if (s === "pending") delete arrived.current[id];
    }
  }, [statuses]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const dots = buildDots();
    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const proj = d3.geoOrthographic().clipAngle(90).precision(0.3);
    // Current camera state, eased toward the focus target every frame.
    const cam = { lng: live.current.focus === "india" ? 80 : 62, lat: 18, scale: 1 };
    let drag: { x: number; y: number; lng: number; lat: number } | null = null;
    let userSpin = 0;
    let hover: string | null = null;
    let raf = 0;
    const pts: { id: string; x: number; y: number }[] = [];

    const onDown = (e: PointerEvent) => {
      if (!interactive) return;
      drag = { x: e.clientX, y: e.clientY, lng: cam.lng, lat: cam.lat };
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      if (drag) {
        const k = 0.25 / cam.scale;
        cam.lng = drag.lng - (e.clientX - drag.x) * k;
        cam.lat = Math.max(-60, Math.min(70, drag.lat + (e.clientY - drag.y) * k));
        userSpin = performance.now();
        return;
      }
      let best: string | null = null;
      let bd = 14 * 14;
      for (const p of pts) {
        const d = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (d < bd) {
          bd = d;
          best = p.id;
        }
      }
      hover = best;
      canvas.style.cursor = best ? "pointer" : interactive ? "grab" : "default";
    };
    const onUp = (e: PointerEvent) => {
      const moved = drag && Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4;
      drag = null;
      if (!moved && hover && onSelect) onSelect(hover);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", () => (hover = null));

    const frame = (now: number) => {
      const { vantages, statuses, analysis, focus, selected, intensity, labels } = live.current;
      const R = Math.min(w, h) * 0.46;
      // Camera easing
      const target = focus === "india" ? { lng: 82, lat: 22.5, scale: 3.1 } : { lng: cam.lng, lat: 20, scale: 1 };
      const idle = !drag && now - userSpin > 2500;
      if (focus === "world" && idle) cam.lng += 0.045;
      if (focus === "india" && idle) {
        cam.lng += (target.lng + Math.sin(now / 4000) * 1.2 - cam.lng) * 0.03;
        cam.lat += (target.lat + Math.cos(now / 5000) * 0.8 - cam.lat) * 0.03;
      }
      if (focus === "world" && idle) cam.lat += (target.lat - cam.lat) * 0.02;
      cam.scale += (target.scale - cam.scale) * 0.05;

      const S = R * cam.scale;
      const cx = w / 2;
      const cy = focus === "india" ? h / 2 + S * 0.0 : h / 2;
      proj.scale(S).translate([cx, cy]).rotate([-cam.lng, -cam.lat]);
      const center: LngLat = [cam.lng, cam.lat];

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Atmosphere + sphere body
      const body = ctx.createRadialGradient(cx - S * 0.35, cy - S * 0.4, S * 0.1, cx, cy, S);
      body.addColorStop(0, "rgba(251,249,244,1)");
      body.addColorStop(1, "rgba(232,225,211,1)");
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, S, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(26,24,20,0.18)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Graticule
      const path = d3.geoPath(proj, ctx);
      ctx.beginPath();
      path(d3.geoGraticule10());
      ctx.strokeStyle = "rgba(26,24,20,0.05)";
      ctx.stroke();

      // Land dots
      const drawDots = (list: LngLat[], color: string, size: number) => {
        ctx.fillStyle = color;
        for (const p of list) {
          const dist = d3.geoDistance(p, center);
          if (dist > Math.PI / 2) continue;
          const xy = proj(p);
          if (!xy) continue;
          const shade = Math.cos(dist);
          ctx.globalAlpha = 0.15 + 0.85 * shade;
          ctx.fillRect(xy[0] - size / 2, xy[1] - size / 2, size, size);
        }
        ctx.globalAlpha = 1;
      };
      const dotSize = Math.max(1.1, Math.min(2.6, S / 210));
      drawDots(dots.world, "rgba(26,24,20,0.32)", dotSize);
      drawDots(dots.india, "rgba(26,24,20,0.62)", Math.max(1.2, dotSize * (focus === "india" ? 0.62 : 0.9)));

      // Positions + cluster colours
      const pos: Record<string, { x: number; y: number; vis: boolean; ll: LngLat; i: number }> = {};
      vantages.forEach((v, i) => {
        const ll: LngLat = [v.lng, v.lat];
        const xy = proj(ll);
        const vis = d3.geoDistance(ll, center) < Math.PI / 2 && !!xy;
        pos[v.id] = { x: xy?.[0] ?? -999, y: xy?.[1] ?? -999, vis, ll, i };
      });
      const clusterOf: Record<string, number> = {};
      analysis?.clusters?.forEach((c, ci) => c.forEach((id) => (clusterOf[id] = ci)));
      const colorOf = (id: string) => (id in clusterOf ? vantageColor(clusterOf[id]) : vantageColor(pos[id]?.i ?? 0));

      // Arcs — lifted great circles
      const drawArc = (a: LngLat, b: LngLat, color: string, width: number, alpha: number, dash?: number[]) => {
        const interp = d3.geoInterpolate(a, b);
        const dist = d3.geoDistance(a, b);
        const lift = Math.min(0.5, 0.08 + dist * 0.35) * (focus === "india" ? 0.6 : 1);
        ctx.beginPath();
        let pen = false;
        for (let t = 0; t <= 1.0001; t += 0.025) {
          const p = interp(t);
          const vis = d3.geoDistance(p, center) < Math.PI / 2 + 0.15;
          const xy = proj(p);
          if (!vis || !xy) {
            pen = false;
            continue;
          }
          const k = 1 + lift * Math.sin(Math.PI * t);
          const x = cx + (xy[0] - cx) * k;
          const y = cy + (xy[1] - cy) * k;
          if (!pen) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          pen = true;
        }
        ctx.setLineDash(dash || []);
        ctx.lineDashOffset = -now / 40;
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      };

      if (analysis?.ok) {
        const ids = analysis.order;
        const edges: { a: string; b: string; s: number }[] = [];
        for (let i = 0; i < ids.length; i++)
          for (let j = i + 1; j < ids.length; j++) edges.push({ a: ids[i], b: ids[j], s: analysis.matrix[i][j] });
        edges.sort((x, y) => y.s - x.s);
        const keep = edges.filter((e) => e.s >= 0.45).slice(0, Math.max(6, ids.length + 2));
        for (const e of keep) {
          const pa = pos[e.a];
          const pb = pos[e.b];
          if (!pa || !pb) continue;
          const sel = selected && (e.a === selected || e.b === selected);
          drawArc(pa.ll, pb.ll, "#1e6a70", sel ? 2.2 : 0.6 + e.s * 1.6, (selected && !sel ? 0.12 : 0.25 + e.s * 0.55) * intensity, [6, 5]);
        }
        const md = analysis.most_different;
        if (pos[md.a] && pos[md.b]) drawArc(pos[md.a].ll, pos[md.b].ll, "#c8442a", 2, 0.95 * intensity, [2, 5]);
      } else {
        // While scanning: beams from the "observer" to each arriving vantage.
        const origin: LngLat = focus === "india" ? [78.9, 22.5] : [77.2, 28.6];
        for (const v of vantages) {
          if (statuses[v.id] !== "ok") continue;
          const age = (now - (arrived.current[v.id] || now)) / 1000;
          if (age < 2.2) drawArc(origin, [v.lng, v.lat], colorOf(v.id), 1.4, Math.max(0, 1 - age / 2.2), [3, 4]);
        }
      }

      // Vantage markers
      pts.length = 0;
      const placed: { x: number; y: number; w: number; h: number }[] = [];
      const markers = vantages.map((v) => pos[v.id]).filter((q) => q?.vis);
      for (const v of vantages) {
        const p = pos[v.id];
        if (!p?.vis) continue;
        pts.push({ id: v.id, x: p.x, y: p.y });
        const st = statuses[v.id];
        const color = st === "error" ? "#a23b3b" : analysis?.ok ? colorOf(v.id) : "#1a1814";
        const isSel = selected === v.id || hover === v.id;
        if (!st || st === "pending") {
          const ph = ((now / 1000 + p.i * 0.17) % 1.4) / 1.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 + ph * 18, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(200,68,42,${(1 - ph) * 0.7 * (st ? 1 : 0.5)})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else {
          const age = (now - (arrived.current[v.id] || 0)) / 1000;
          if (age < 1.6) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 5 + age * 26, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
        const r = isSel ? 6.5 : 4.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = st === "ok" || st === "error" ? color : "#fbf9f4";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        if (!labels && !isSel) continue;
        ctx.font = `${isSel ? 600 : 500} ${isSel ? 12.5 : 11.5}px "IBM Plex Sans", sans-serif`;
        const label = v.label;
        const tw = ctx.measureText(label).width;
        const spots: [number, number][] = [
          [p.x + 9, p.y - 7],
          [p.x - tw - 9, p.y - 7],
          [p.x + 9, p.y + 13],
          [p.x - tw - 9, p.y + 13],
          [p.x - tw / 2, p.y - 14],
          [p.x - tw / 2, p.y + 20],
        ];
        let spot: [number, number] | null = null;
        for (const [lx, ly] of spots) {
          const box = { x: lx - 3, y: ly - 11, w: tw + 6, h: 16 };
          const hit = placed.some((b) => box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y) || markers.some((m) => m.x > box.x - 4 && m.x < box.x + box.w + 4 && m.y > box.y - 4 && m.y < box.y + box.h + 4 && !(m.x === p.x && m.y === p.y));
          if (!hit) {
            spot = [lx, ly];
            placed.push(box);
            break;
          }
        }
        if (!spot && !isSel) continue;
        const [lx, ly] = spot ?? spots[0];
        ctx.fillStyle = "rgba(251,249,244,0.88)";
        ctx.fillRect(lx - 3, ly - 11, tw + 6, 16);
        ctx.fillStyle = isSel ? "#000" : "rgba(26,24,20,0.88)";
        ctx.fillText(label, lx, ly + 1);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
    };
  }, [interactive, onSelect]);

  return <canvas ref={canvasRef} className={className} style={{ width: "100%", height: "100%", touchAction: "none" }} />;
}
