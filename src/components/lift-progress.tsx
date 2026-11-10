"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { LiftHistory } from "@/lib/exercise";
import { daysBetween } from "@/lib/trend";
import { formatDay } from "@/lib/dates";
import { input } from "./ui";

const METRICS = {
  e1rm: { label: "Est. 1RM", unit: "lb", get: (s: LiftHistory["sessions"][number]) => s.bestE1rm },
  top: { label: "Top weight", unit: "lb", get: (s: LiftHistory["sessions"][number]) => s.topWeight },
  volume: { label: "Volume", unit: "lb", get: (s: LiftHistory["sessions"][number]) => (s.volume > 0 ? s.volume : null) },
} as const;
type MetricKey = keyof typeof METRICS;

const HEIGHT = 190;
const M = { top: 12, right: 12, bottom: 24, left: 44 };

/** Pick a lift and a metric; one line of that metric per session. */
export function LiftProgress({ history }: { history: LiftHistory[] }) {
  const [lift, setLift] = useState(history[0]?.exercise ?? "");
  const [metric, setMetric] = useState<MetricKey>("e1rm");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = history.find((x) => x.exercise === lift) ?? history[0];
  const pts = useMemo(
    () => (h ? h.sessions.map((s) => ({ day: s.day, v: METRICS[metric].get(s), s })).filter((p): p is typeof p & { v: number } => p.v != null) : []),
    [h, metric],
  );

  const g = useMemo(() => {
    if (pts.length === 0) return null;
    const vals = pts.map((p) => p.v);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const pad = Math.max(5, (hi - lo) * 0.15);
    lo = Math.max(0, lo - pad);
    hi = hi + pad;
    const raw = (hi - lo) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
    const min = Math.floor(lo / step) * step;
    const max = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let t = min; t <= max + 1e-9; t += step) ticks.push(Math.round(t * 10) / 10);
    const first = pts[0].day;
    const span = Math.max(1, daysBetween(first, pts[pts.length - 1].day));
    const iw = width - M.left - M.right;
    const x = (d: string) => (pts.length === 1 ? M.left + iw / 2 : M.left + (daysBetween(first, d) / span) * iw);
    const y = (v: number) => M.top + (1 - (v - min) / (max - min || 1)) * (HEIGHT - M.top - M.bottom);
    return { ticks, x, y };
  }, [pts, width]);

  if (history.length === 0) return <p className="text-sm text-muted">Log weightlifting sets to see progress here.</p>;
  const hp = hover == null ? null : pts[hover];
  // Nearest session to the pointer (mouse hover or a tap on the phone).
  function pick(e: React.PointerEvent<SVGSVGElement>) {
    if (!g) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    pts.forEach((p, i) => {
      if (Math.abs(g.x(p.day) - px) < Math.abs(g.x(pts[best].day) - px)) best = i;
    });
    setHover(best);
  }
  const fmt = (v: number) => (v >= 10000 ? `${Math.round(v / 1000)}K` : v.toLocaleString());

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select className={`${input} py-1.5 text-sm`} value={h?.exercise} onChange={(e) => { setLift(e.target.value); setHover(null); }} aria-label="Lift">
          {history.map((x) => (
            <option key={x.exercise} value={x.exercise}>
              {x.exercise} ({x.sessions.length})
            </option>
          ))}
        </select>
      </div>
      <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Metric">
        {(Object.keys(METRICS) as MetricKey[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={metric === m}
            onClick={() => { setMetric(m); setHover(null); }}
            className={`flex-1 rounded-md px-2 py-1 ${metric === m ? "bg-background text-foreground" : "text-muted"}`}
          >
            {METRICS[m].label}
          </button>
        ))}
      </div>

      <div ref={wrapRef} className="relative">
        {!g ? (
          <p className="py-8 text-center text-sm text-muted">No {METRICS[metric].label.toLowerCase()} data for this lift (bodyweight or high-rep sets).</p>
        ) : (
          <svg
            width={width}
            height={HEIGHT}
            className="block touch-pan-y select-none"
            role="img"
            aria-label={`${h.exercise} ${METRICS[metric].label} over ${pts.length} sessions`}
            onPointerMove={(e) => pick(e)}
            onPointerDown={(e) => pick(e)}
            onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          >
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={width - M.right} y1={g.y(t)} y2={g.y(t)} stroke="var(--grid)" />
                <text x={M.left - 6} y={g.y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {[pts[0], pts[pts.length - 1]].filter((p, i, a) => i === 0 || p !== a[0]).map((p, i) => (
              <text key={p.day} x={g.x(p.day)} y={HEIGHT - 6} textAnchor={pts.length === 1 ? "middle" : i === 0 ? "start" : "end"} className="fill-muted text-[11px]">
                {formatDay(p.day, { month: "short", day: "numeric" })}
              </text>
            ))}
            {pts.length > 1 && (
              <path
                d={pts.map((p, i) => `${i ? "L" : "M"}${g.x(p.day).toFixed(1)},${g.y(p.v).toFixed(1)}`).join("")}
                fill="none"
                stroke="var(--series-trend)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            )}
            {pts.map((p, i) => (
              <circle key={p.day} cx={g.x(p.day)} cy={g.y(p.v)} r={hover === i ? 5 : 4} fill="var(--series-trend)" stroke="var(--surface)" strokeWidth={2} />
            ))}
            {hp && <line x1={g.x(hp.day)} x2={g.x(hp.day)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" pointerEvents="none" />}
          </svg>
        )}
        {hp && g && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(g.x(hp.day) - 75, 0), width - 150), width: 150 }}
          >
            <p className="text-muted">{formatDay(hp.day)}</p>
            <p>
              <strong className="tabular-nums">{hp.v.toLocaleString()} lb</strong> <span className="text-muted">{METRICS[metric].label.toLowerCase()}</span>
            </p>
            <p className="text-muted">
              {hp.s.sets} sets · {hp.s.reps} reps
            </p>
          </div>
        )}
      </div>
      {metric === "e1rm" && <p className="text-xs text-muted">Estimated 1-rep max uses the Epley formula on your best set (sets of 1–12 reps).</p>}
    </div>
  );
}
