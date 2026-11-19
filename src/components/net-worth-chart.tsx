"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDay } from "@/lib/dates";
import { daysBetween } from "@/lib/trend";
import { formatMoney, type NetWorthPoint } from "@/lib/finance";

const HEIGHT = 180;
const M = { top: 10, right: 10, bottom: 24, left: 52 };

/** Net worth per day (one series, so no legend; the card title names it). */
export function NetWorthChart({ points }: { points: NetWorthPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const first = points[0].day;
    const span = Math.max(1, daysBetween(first, points[points.length - 1].day));
    const vals = points.map((p) => p.netWorth);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.02, 100);
    const step = niceStep((hi - lo + 2 * pad) / 4);
    const min = Math.floor((lo - pad) / step) * step;
    const max = Math.ceil((hi + pad) / step) * step;
    const ticks: number[] = [];
    for (let v = min; v <= max + 1e-6; v += step) ticks.push(v);
    const iw = width - M.left - M.right;
    const x = (day: string) => M.left + (points.length === 1 ? iw / 2 : (daysBetween(first, day) / span) * iw);
    const y = (v: number) => M.top + (1 - (v - min) / (max - min)) * (HEIGHT - M.top - M.bottom);
    const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.netWorth).toFixed(1)}`).join("");
    // Distinct days only: with two points the middle one is the last one.
    const xTicks = [...new Set([first, points[Math.floor(points.length / 2)].day, points[points.length - 1].day])];
    return { x, y, ticks, path, xTicks };
  }, [points, width]);

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(g.x(p.day) - px) < Math.abs(g.x(points[best].day) - px)) best = i;
    });
    setHover(best);
  };
  const hp = hover == null ? null : points[hover];

  return (
    <div ref={wrapRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        className="block touch-pan-y select-none"
        role="img"
        aria-label={`Net worth from ${formatDay(points[0].day)} to ${formatDay(points[points.length - 1].day)}: ${formatMoney(points[points.length - 1].netWorth)} now`}
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      >
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={g.y(t)} y2={g.y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 6} y={g.y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {compact(t)}
            </text>
          </g>
        ))}
        {g.xTicks.map((d, i) => (
          <text
            key={d + i}
            x={g.x(d)}
            y={HEIGHT - 6}
            textAnchor={g.xTicks.length === 1 ? "middle" : i === 0 ? "start" : i === g.xTicks.length - 1 ? "end" : "middle"}
            className="fill-muted text-[11px]"
          >
            {formatDay(d, { month: "short", day: "numeric" })}
          </text>
        ))}
        {points.length > 1 ? (
          <path d={g.path} fill="none" stroke="var(--series-trend)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <circle cx={g.x(points[0].day)} cy={g.y(points[0].netWorth)} r={4} fill="var(--series-trend)" />
        )}
        {hp && (
          <g pointerEvents="none">
            <line x1={g.x(hp.day)} x2={g.x(hp.day)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--muted)" strokeWidth={1} />
            <circle cx={g.x(hp.day)} cy={g.y(hp.netWorth)} r={4} fill="var(--series-trend)" stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {hp && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(g.x(hp.day) - 80, 0), width - 160), width: 160 }}
        >
          <p className="text-muted">{formatDay(hp.day)}</p>
          <p>
            <strong className="tabular-nums">{formatMoney(hp.netWorth)}</strong> <span className="text-muted">net worth</span>
          </p>
          <p className="text-muted tabular-nums">
            {formatMoney(hp.assets)} assets · {formatMoney(hp.debts)} debt
          </p>
        </div>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1))));
  for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * p) return m * p;
  return 10 * p;
}

/** $12.5K, $1.2M, −$3K */
function compact(n: number) {
  const a = Math.abs(n);
  const s = a >= 1e6 ? `${+(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${+(a / 1e3).toFixed(1)}K` : `${Math.round(a)}`;
  return `${n < 0 ? "−" : ""}$${s}`;
}
