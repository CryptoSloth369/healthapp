"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDay } from "@/lib/dates";

export type CalorieBar = { day: string; kcal: number | null; label?: string }; // null = nothing logged

const HEIGHT = 200;
const M = { top: 14, right: 8, bottom: 24, left: 40 };

/**
 * Columns of calories per day (or per week), with the target as a reference
 * line. Unlogged periods are left empty rather than drawn as zero.
 */
export function CalorieChart({ bars, target, unit }: { bars: CalorieBar[]; target: number | null; unit: string }) {
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
    const vals = bars.map((b) => b.kcal ?? 0);
    const top = Math.max(target ?? 0, ...vals, 500);
    const step = top > 4000 ? 1000 : 500;
    const max = Math.ceil((top * 1.05) / step) * step;
    const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
    const iw = width - M.left - M.right;
    const ih = HEIGHT - M.top - M.bottom;
    const slot = iw / Math.max(1, bars.length);
    const gap = slot > 6 ? 2 : slot > 3 ? 1 : 0;
    const bw = Math.min(24, Math.max(1, slot - gap));
    const x = (i: number) => M.left + i * slot + (slot - bw) / 2;
    const y = (v: number) => M.top + (1 - v / max) * ih;
    const labelEvery = Math.ceil(bars.length / 4);
    return { ticks, slot, bw, x, y, labelEvery };
  }, [bars, target, width]);

  const hb = hover == null ? null : bars[hover];
  const base = HEIGHT - M.bottom;

  return (
    <div ref={wrapRef} className="relative">
      <svg
        width={width}
        height={HEIGHT}
        className="block touch-pan-y select-none"
        role="img"
        aria-label={`Calories per ${unit}${target ? `, target ${target}` : ""}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - r.left - M.left) / g.slot);
          setHover(i >= 0 && i < bars.length ? i : null);
        }}
        onPointerDown={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const i = Math.floor((e.clientX - r.left - M.left) / g.slot);
          setHover(i >= 0 && i < bars.length ? i : null);
        }}
        onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
      >
        {g.ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={g.y(t)} y2={g.y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 6} y={g.y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t >= 1000 ? `${t / 1000}K` : t}
            </text>
          </g>
        ))}

        {bars.map((b, i) => {
          if (b.kcal == null || b.kcal <= 0) return null;
          const top = g.y(b.kcal);
          const h = base - top;
          const r = Math.min(4, g.bw / 2, h);
          // Rounded data-end, square at the baseline.
          const x0 = g.x(i);
          const x1 = x0 + g.bw;
          const d = `M${x0},${base}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x1 - r}Q${x1},${top} ${x1},${top + r}V${base}Z`;
          return <path key={b.day} d={d} fill="var(--series-trend)" opacity={hover == null || hover === i ? 1 : 0.55} />;
        })}

        {target != null && (
          <g pointerEvents="none">
            <line x1={M.left} x2={width - M.right} y1={g.y(target)} y2={g.y(target)} stroke="var(--foreground)" strokeWidth={1} opacity={0.6} />
          </g>
        )}

        {bars.map((b, i) =>
          i % g.labelEvery === 0 ? (
            <text key={b.day} x={g.x(i) + g.bw / 2} y={HEIGHT - 6} textAnchor={i === 0 ? "start" : "middle"} className="fill-muted text-[11px]">
              {formatDay(b.day, { month: "short", day: "numeric" })}
            </text>
          ) : null,
        )}
      </svg>

      {hb && (
        <div
          className="pointer-events-none absolute top-0 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: Math.min(Math.max(g.x(hover!) + g.bw / 2 - 70, 0), width - 140), width: 140 }}
        >
          <p className="text-muted">{hb.label ?? formatDay(hb.day)}</p>
          {hb.kcal == null ? (
            <p className="text-muted">Not logged</p>
          ) : (
            <p className="flex items-center gap-1.5">
              <svg width="10" height="10" aria-hidden>
                <rect width="10" height="10" rx="2" fill="var(--series-trend)" />
              </svg>
              <strong className="tabular-nums">{hb.kcal.toLocaleString()}</strong>
              <span className="text-muted">kcal{unit === "week" ? "/day avg" : ""}</span>
            </p>
          )}
          {hb.kcal != null && target != null && (
            <p className="text-muted tabular-nums">
              {hb.kcal > target ? "+" : ""}
              {(hb.kcal - target).toLocaleString()} vs target
            </p>
          )}
        </div>
      )}
    </div>
  );
}
