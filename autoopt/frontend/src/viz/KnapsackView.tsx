import { useMemo, useState } from "react";

type Item = { name: string; value: number; weights: number[] };

export default function KnapsackView({ data }: {
  data: { selected: number[]; loads: number[]; capacities: number[]; dimension_names: string[]; items: Item[]; total_value: number; conflicts: number[][] };
}) {
  const [hover, setHover] = useState<number | null>(null);
  const sel = useMemo(() => new Set(data.selected), [data.selected]);
  const order = useMemo(
    () => data.items.map((_, i) => i).sort((a, b) => Number(sel.has(b)) - Number(sel.has(a)) || data.items[b].value - data.items[a].value),
    [data.items, sel],
  );
  const conflictsOf = (i: number) => data.conflicts.filter((c) => c.includes(i)).map((c) => (c[0] === i ? c[1] : c[0]));
  const maxV = Math.max(...data.items.map((i) => i.value), 1);
  const h = hover !== null ? data.items[hover] : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="label mb-2">Resource usage</div>
        <div className="space-y-2.5">
          {data.capacities.map((c, k) => {
            const used = data.loads[k];
            const extra = h && !sel.has(hover!) ? h.weights[k] : 0;
            return (
              <div key={k} className="grid grid-cols-[90px_1fr_110px] items-center gap-3 text-xs">
                <span className="text-sub">{data.dimension_names[k]}</span>
                <div className="relative h-3 rounded-full bg-raised overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(100 * used) / Math.max(1, c)}%` }} />
                  {h && (
                    <div
                      className={`absolute inset-y-0 rounded-full ${sel.has(hover!) ? "bg-ink/40" : used + extra > c ? "bg-bad/70" : "bg-good/60"}`}
                      style={
                        sel.has(hover!)
                          ? { left: `${(100 * (used - h.weights[k])) / c}%`, width: `${(100 * h.weights[k]) / c}%` }
                          : { left: `${(100 * used) / c}%`, width: `${Math.min(100 - (100 * used) / c, (100 * extra) / c)}%` }
                      }
                    />
                  )}
                </div>
                <span className="num text-right text-sub">
                  {used} / {c} <span className="text-mute">({Math.round((100 * used) / Math.max(1, c))}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center gap-3">
          <span className="label">Items</span>
          <span className="text-xs text-sub">
            {data.selected.length} of {data.items.length} selected · tile size = value
          </span>
          <span className="ml-auto flex items-center gap-3 text-xs text-sub">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-accent" /> selected</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-line bg-raised" /> left out</span>
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {order.map((i) => {
            const it = data.items[i];
            const s = 18 + 22 * Math.sqrt(it.value / maxV);
            const isSel = sel.has(i);
            const isConf = hover !== null && conflictsOf(hover).includes(i);
            return (
              <div
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                className={`rounded-[4px] border transition ${isSel ? "bg-accent border-accent" : "bg-raised border-line"} ${
                  isConf ? "ring-2 ring-bad" : ""
                } ${hover === i ? "ring-2 ring-ink" : ""}`}
                style={{ width: s, height: s }}
                title={`${it.name}: value ${it.value}`}
              />
            );
          })}
        </div>
        <div className="mt-3 h-10 text-xs text-sub">
          {h ? (
            <>
              <span className="font-semibold text-ink">{h.name}</span> · value <span className="num">{h.value}</span> · weights{" "}
              <span className="num">{h.weights.join(" / ")}</span> · {sel.has(hover!) ? "selected" : "not selected"}
              {conflictsOf(hover!).length > 0 && (
                <span className="text-bad"> · conflicts with {conflictsOf(hover!).map((c) => data.items[c].name).join(", ")}</span>
              )}
            </>
          ) : (
            "Hover an item to see its value, weights, conflicts and what it would use."
          )}
        </div>
      </div>
    </div>
  );
}
