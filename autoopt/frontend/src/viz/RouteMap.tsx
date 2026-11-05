import { useMemo, useState } from "react";
import { cat, useWidth } from "./useWidth";

type Customer = { name: string; x: number; y: number; demand: number };
type Route = { vehicle: number; stops: number[]; load: number; distance: number };

export default function RouteMap({ data, height = 420 }: {
  data: { depot: { x: number; y: number }; customers: Customer[]; routes: Route[]; capacity?: number };
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hoverRoute, setHoverRoute] = useState<number | null>(null);
  const [hoverCust, setHoverCust] = useState<number | null>(null);
  const pad = 18;
  const { sx, sy } = useMemo(() => {
    const xs = [data.depot.x, ...data.customers.map((c) => c.x)];
    const ys = [data.depot.y, ...data.customers.map((c) => c.y)];
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = Math.min((width - 2 * pad) / Math.max(1e-9, x1 - x0), (height - 2 * pad) / Math.max(1e-9, y1 - y0));
    const ox = (width - s * (x1 - x0)) / 2;
    const oy = (height - s * (y1 - y0)) / 2;
    return { sx: (v: number) => ox + (v - x0) * s, sy: (v: number) => height - (oy + (v - y0) * s) };
  }, [data, width, height]);
  const maxDem = Math.max(1, ...data.customers.map((c) => c.demand));
  const routeOf = useMemo(() => {
    const m: Record<number, number> = {};
    data.routes.forEach((r, k) => r.stops.forEach((s) => (m[s] = k)));
    return m;
  }, [data.routes]);
  const n = data.routes.length;
  const color = (k: number) => (n > 8 && hoverRoute === k ? "rgb(var(--accent))" : cat(k, n));

  return (
    <div>
      <div ref={ref} className="relative w-full rounded-lg bg-bg/60 border border-line">
        <svg width={width} height={height} role="img" aria-label="Vehicle routes map">
          {data.routes.map((r, k) => {
            const pts = [data.depot, ...r.stops.map((s) => data.customers[s]), data.depot];
            const dim = hoverRoute !== null && hoverRoute !== k;
            return (
              <polyline
                key={k}
                points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(" ")}
                fill="none"
                stroke={color(k)}
                strokeWidth={hoverRoute === k ? 3 : 2}
                strokeLinejoin="round"
                opacity={dim ? 0.15 : 0.95}
                onMouseEnter={() => setHoverRoute(k)}
                onMouseLeave={() => setHoverRoute(null)}
              />
            );
          })}
          {data.customers.map((c, i) => {
            const k = routeOf[i];
            const dim = hoverRoute !== null && hoverRoute !== k;
            return (
              <circle
                key={i}
                cx={sx(c.x)}
                cy={sy(c.y)}
                r={4 + 4 * (c.demand / maxDem)}
                fill={k === undefined ? "rgb(var(--mute))" : color(k)}
                stroke="rgb(var(--panel))"
                strokeWidth={2}
                opacity={dim ? 0.2 : 1}
                onMouseEnter={() => {
                  setHoverCust(i);
                  if (k !== undefined) setHoverRoute(k);
                }}
                onMouseLeave={() => {
                  setHoverCust(null);
                  setHoverRoute(null);
                }}
              />
            );
          })}
          <rect x={sx(data.depot.x) - 7} y={sy(data.depot.y) - 7} width={14} height={14} rx={3} fill="rgb(var(--ink))" stroke="rgb(var(--panel))" strokeWidth={2} />
        </svg>
        {hoverCust !== null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-lg"
            style={{ left: Math.min(sx(data.customers[hoverCust].x) + 12, width - 170), top: sy(data.customers[hoverCust].y) + 12 }}
          >
            <div className="font-semibold">{data.customers[hoverCust].name}</div>
            <div className="text-sub num">
              demand {data.customers[hoverCust].demand}
              {routeOf[hoverCust] !== undefined && ` · vehicle ${routeOf[hoverCust] + 1}`}
            </div>
          </div>
        )}
      </div>
      {data.routes.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {data.routes.map((r, k) => (
            <div
              key={k}
              onMouseEnter={() => setHoverRoute(k)}
              onMouseLeave={() => setHoverRoute(null)}
              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${hoverRoute === k ? "bg-raised" : ""}`}
            >
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: color(k) }} />
              <span className="text-ink font-medium">Vehicle {k + 1}</span>
              <span className="text-mute">{r.stops.length} stops</span>
              <span className="ml-auto num text-sub">{r.distance.toFixed(1)}</span>
              {data.capacity && (
                <span className="w-14 h-1.5 rounded-full bg-line overflow-hidden" title={`load ${r.load}/${data.capacity}`}>
                  <span className="block h-full bg-sub" style={{ width: `${(100 * r.load) / data.capacity}%` }} />
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
