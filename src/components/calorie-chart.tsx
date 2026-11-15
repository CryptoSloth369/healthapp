"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDay } from "@/lib/dates";
import { barPath, HatchPattern } from "./chart-bits";

/**
 * kcal = null: nothing logged or estimated. `logged`/`estimated` count the days
 * behind the bar (1/0 or 0/1 for a single day; up to 7 for a weekly average).
 */
export type CalorieBar = { day: string; kcal: number | null; logged: number; estimated: number; label?: string };

const HEIGHT = 200;
const M = { top: 14, right: 8, bottom: 24, left: 40 };

/**
 * Columns of calories per day (or per week), with the target as a reference
 * line. Logged calories are solid; calories back-calculated from weight are
 * hatched (a weekly bar is split by its share of logged days). Unknown periods
 * are left empty rather than drawn as zero.
 */
export function CalorieChart({ bars, target, unit }: { bars: CalorieBar[]; target: number | null; unit: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);
  const hatchId = `hatch-${useId().replace(/:/g, "")}`;

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

        <defs>
          <HatchPattern id={hatchId} color="var(--series-trend)" />
        </defs>
        {bars.map((b, i) => {
          if (b.kcal == null || b.kcal <= 0) return null;
          const x0 = g.x(i);
          const x1 = x0 + g.bw;
          const top = g.y(b.kcal);
          const share = b.logged / Math.max(1, b.logged + b.estimated);
          // Solid (logged) from the baseline, hatched (estimated) above it, with a 2px gap between.
          const split = base - (base - top) * share;
          const op = hover == null || hover === i ? 1 : 0.55;
          return (
            <g key={b.day} opacity={op}>
              {share > 0 && <path d={barPath(x0, x1, base, share < 1 ? split : top, share >= 1)} fill="var(--series-trend)" />}
              {share < 1 && (share > 0 ? split - 2 : base) - top > 0.5 && (
                <path d={barPath(x0, x1, share > 0 ? split - 2 : base, top, true)} fill={`url(#${hatchId})`} />
              )}
            </g>
          );
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
            <p className="text-muted">No data</p>
          ) : (
            <>
              <p>
                <strong className="tabular-nums">
                  {hb.estimated > 0 ? "≈" : ""}
                  {hb.kcal.toLocaleString()}
                </strong>{" "}
                <span className="text-muted">kcal{unit === "week" ? "/day avg" : ""}</span>
              </p>
              <p className="text-muted">
                {unit === "week"
                  ? [hb.logged && `${hb.logged} logged`, hb.estimated && `${hb.estimated} est.`].filter(Boolean).join(" · ") + " days"
                  : hb.logged
                    ? "Logged"
                    : "Estimated from weight"}
              </p>
            </>
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
