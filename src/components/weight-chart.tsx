"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TrendPoint } from "@/lib/trend";
import { daysBetween } from "@/lib/trend";
import { formatDay } from "@/lib/dates";

const RANGES = [
  { key: "30", label: "30D", days: 30 },
  { key: "90", label: "90D", days: 90 },
  { key: "365", label: "1Y", days: 365 },
  { key: "all", label: "All", days: Infinity },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

const HEIGHT = 220;
const M = { top: 12, right: 12, bottom: 24, left: 40 };

export function WeightChart({ points, goalLb }: { points: TrendPoint[]; goalLb: number | null }) {
  const [range, setRange] = useState<RangeKey>("90");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => {
    if (points.length === 0) return null;
    const last = points[points.length - 1].day;
    const days = RANGES.find((r) => r.key === range)!.days;
    const pts = points.filter((p) => daysBetween(p.day, last) < days);
    const first = pts[0].day;
    const span = Math.max(1, daysBetween(first, last));

    const vals = pts.flatMap((p) => [p.weight, p.trend]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    // Show the goal line only when it's close enough not to flatten the data.
    const showGoal = goalLb != null && goalLb > lo - 10 && goalLb < hi + 10;
    if (showGoal) {
      lo = Math.min(lo, goalLb!);
      hi = Math.max(hi, goalLb!);
    }
    const { ticks, min, max } = niceTicks(lo - 0.5, hi + 0.5);

    const iw = width - M.left - M.right;
    const ih = HEIGHT - M.top - M.bottom;
    const x = (day: string) => M.left + (pts.length === 1 ? iw / 2 : (daysBetween(first, day) / span) * iw);
    const y = (v: number) => M.top + (1 - (v - min) / (max - min)) * ih;

    const xTickCount = Math.min(4, pts.length);
    const xTicks =
      pts.length === 1
        ? [first]
        : Array.from({ length: xTickCount }, (_, i) => {
            const t = new Date(Date.parse(first + "T00:00:00Z") + (span * i * 86_400_000) / Math.max(1, xTickCount - 1));
            return t.toISOString().slice(0, 10);
          });

    const trendPath = pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.trend).toFixed(1)}`).join("");
    return { pts, x, y, ticks, xTicks, trendPath, showGoal, iw };
  }, [points, range, width, goalLb]);

  if (!view) {
    return <p className="py-10 text-center text-sm text-muted">Log a weigh-in to start your chart.</p>;
  }

  const { pts, x, y, ticks, xTicks, trendPath, showGoal } = view;
  const hp = hover == null ? null : pts[hover];

  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(x(p.day) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <ul className="flex items-center gap-3 text-xs text-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5">
            <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill="var(--series-raw)" /></svg>
            Weigh-in
          </li>
          <li className="flex items-center gap-1.5">
            <svg width="14" height="10" aria-hidden><path d="M1 5h12" stroke="var(--series-trend)" strokeWidth="2" strokeLinecap="round" /></svg>
            Trend
          </li>
        </ul>
        <div className="flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => {
                setRange(r.key);
                setHover(null);
              }}
              aria-pressed={range === r.key}
              className={`rounded-md px-2 py-1 ${range === r.key ? "bg-background text-foreground" : "text-muted"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-pan-y select-none"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
          role="img"
          aria-label={`Weight chart: ${pts.length} weigh-ins from ${formatDay(pts[0].day)} to ${formatDay(pts[pts.length - 1].day)}, trend now ${pts[pts.length - 1].trend.toFixed(1)} lb`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((d, i) => (
            <text
              key={d + i}
              x={x(d)}
              y={HEIGHT - 6}
              textAnchor={xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              className="fill-muted text-[11px]"
            >
              {formatDay(d, { month: "short", day: "numeric" })}
            </text>
          ))}

          {showGoal && (
            <g>
              <line x1={M.left} x2={width - M.right} y1={y(goalLb!)} y2={y(goalLb!)} stroke="var(--muted)" strokeWidth={1} opacity={0.7} />
              <text x={width - M.right} y={y(goalLb!) - 4} textAnchor="end" className="fill-muted text-[11px]">
                Goal {goalLb}
              </text>
            </g>
          )}

          {pts.map((p) => (
            <circle key={p.day} cx={x(p.day)} cy={y(p.weight)} r={pts.length > 120 ? 2.5 : 4} fill="var(--series-raw)" stroke="var(--surface)" strokeWidth={pts.length > 120 ? 1 : 2} />
          ))}
          {pts.length > 1 && (
            <path d={trendPath} fill="none" stroke="var(--series-trend)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}

          {hp && (
            <g pointerEvents="none">
              <line x1={x(hp.day)} x2={x(hp.day)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />
              <circle cx={x(hp.day)} cy={y(hp.weight)} r={5} fill="var(--series-raw)" stroke="var(--surface)" strokeWidth={2} />
              <circle cx={x(hp.day)} cy={y(hp.trend)} r={4} fill="var(--series-trend)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
        </svg>

        {hp && (
          <div
            className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max(x(hp.day) - 70, 0), width - 140), width: 140 }}
          >
            <p className="text-muted">{formatDay(hp.day)}</p>
            <p className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill="var(--series-raw)" /></svg>
              <strong className="tabular-nums">{hp.weight.toFixed(1)}</strong> <span className="text-muted">weigh-in</span>
            </p>
            <p className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden><path d="M1 5h8" stroke="var(--series-trend)" strokeWidth="2" strokeLinecap="round" /></svg>
              <strong className="tabular-nums">{hp.trend.toFixed(1)}</strong> <span className="text-muted">trend</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Round axis ticks: about 4 lines at a clean step. */
function niceTicks(lo: number, hi: number) {
  const steps = [0.5, 1, 2, 5, 10, 20, 50];
  const step = steps.find((s) => (hi - lo) / s <= 5) ?? 100;
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-9; v += step) ticks.push(Math.round(v * 10) / 10);
  return { ticks, min, max: max === min ? min + step : max };
}
