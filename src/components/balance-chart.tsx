"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatDay } from "@/lib/dates";
import { daysBetween } from "@/lib/trend";
import { barPath, HatchPattern, HatchSwatch, SolidSwatch } from "./chart-bits";
import { sourceLine } from "./calorie-chart";

/** One bar: a single day, or a week's daily average (start…end). */
export type BalanceBar = {
  start: string;
  end: string;
  /** intake − burn per day; negative = deficit. null = unknown. */
  balance: number | null;
  intake: number | null;
  burn: number | null;
  /** Calories from logs (the solid part of the bar is this share of intake). */
  loggedKcal: number;
  logged: number;
  partial: number;
  estimated: number;
  confidence?: string | null;
  label?: string;
  /** Days the estimate was spread over (single-day estimated bars). */
  windowDays?: number | null;
};
export type TrendRow = { day: string; trend: number | null; weighedIn: boolean };

const BAL_H = 150;
const GAP = 22;
const WT_H = 76;
const AXIS = 22;
const HEIGHT = BAL_H + GAP + WT_H + AXIS;
const M = { top: 8, right: 8, left: 44 };
const DEFICIT = "var(--series-deficit)";
const SURPLUS = "var(--series-surplus)";

/**
 * Daily (or weekly-average) deficit/surplus as bars around zero, with the
 * trend weight underneath on the same time axis so you can see the effect.
 * Solid = from logged food, hatched = intake estimated from weight.
 */
export function BalanceChart({ bars, trend, start, end }: { bars: BalanceBar[]; trend: TrendRow[]; start: string; end: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const nDays = daysBetween(start, end) + 1;
    const iw = width - M.left - M.right;
    const dayW = iw / nDays;
    const xDay = (day: string) => M.left + daysBetween(start, day) * dayW;

    // Balance panel: zero line plus nice ticks covering the data.
    const vals = bars.map((b) => b.balance ?? 0);
    const lo = Math.min(0, ...vals);
    const hi = Math.max(0, ...vals);
    const range = Math.max(hi - lo, 500);
    const step = range > 3000 ? 1000 : range > 1200 ? 500 : 250;
    let bMin = Math.floor(lo / step) * step;
    let bMax = Math.ceil(hi / step) * step;
    if (bMin === bMax) {
      bMin -= step;
      bMax += step;
    }
    const yB = (v: number) => M.top + (1 - (v - bMin) / (bMax - bMin)) * (BAL_H - M.top);
    const bTicks: number[] = [];
    for (let v = bMin; v <= bMax; v += step) bTicks.push(v);
    const bTicksShown = bTicks.length > 5 ? bTicks.filter((v) => v % (step * 2) === 0) : bTicks;

    // Weight panel.
    const tr = trend.filter((t) => t.trend != null) as { day: string; trend: number; weighedIn: boolean }[];
    let wLo = Math.min(...tr.map((t) => t.trend));
    let wHi = Math.max(...tr.map((t) => t.trend));
    if (wHi - wLo < 2) {
      const mid = (wHi + wLo) / 2;
      wLo = mid - 1;
      wHi = mid + 1;
    }
    const wTop = BAL_H + GAP;
    const yW = (v: number) => wTop + 6 + (1 - (v - wLo) / (wHi - wLo)) * (WT_H - 12);
    const wPath = tr.map((t, i) => `${i ? "L" : "M"}${(xDay(t.day) + dayW / 2).toFixed(1)},${yW(t.trend).toFixed(1)}`).join("");

    const labelEvery = Math.ceil(nDays / 4);
    const xLabels = Array.from({ length: nDays }, (_, i) => i)
      .filter((i) => i % labelEvery === 0)
      .map((i) => new Date(Date.parse(start + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10));

    return { nDays, dayW, xDay, yB, bTicks: bTicksShown, tr, yW, wTop, wLo, wHi, wPath, xLabels };
  }, [bars, trend, start, end, width]);

  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.floor((e.clientX - r.left - M.left) / g.dayW);
    if (i < 0 || i >= g.nDays) return setHover(null);
    const day = new Date(Date.parse(start + "T00:00:00Z") + i * 86_400_000).toISOString().slice(0, 10);
    const bi = bars.findIndex((b) => b.start <= day && day <= b.end);
    setHover(bi >= 0 ? bi : null);
  };

  const hb = hover == null ? null : bars[hover];
  const hbTrend = hb ? [...g.tr].reverse().find((t) => t.day <= hb.end)?.trend ?? null : null;
  const zero = g.yB(0);
  const gap = g.dayW > 6 ? 2 : g.dayW > 3 ? 1 : 0;

  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <SolidSwatch color={DEFICIT} />
          Deficit
        </li>
        <li className="flex items-center gap-1.5">
          <SolidSwatch color={SURPLUS} />
          Surplus
        </li>
        <li className="flex items-center gap-1.5">
          <HatchSwatch id={`${uid}-lg`} color="var(--muted)" />
          Estimated from weight
        </li>
        <li className="flex items-center gap-1.5">
          <svg width="14" height="10" aria-hidden>
            <path d="M1 5h12" stroke="var(--series-trend)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Trend weight
        </li>
      </ul>

      <div ref={wrapRef} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          className="block touch-pan-y select-none"
          role="img"
          aria-label="Daily calorie deficit or surplus, with trend weight below"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
        >
          <defs>
            <HatchPattern id={`${uid}-d`} color={DEFICIT} />
            <HatchPattern id={`${uid}-s`} color={SURPLUS} />
          </defs>

          {g.bTicks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={g.yB(t)} y2={g.yB(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.left - 6} y={g.yB(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                {t > 0 ? "+" : ""}
                {Math.abs(t) >= 1000 ? `${t / 1000}K` : t}
              </text>
            </g>
          ))}

          {bars.map((b, i) => {
            if (b.balance == null || b.balance === 0) return null;
            const x0 = g.xDay(b.start) + gap / 2;
            const x1 = g.xDay(b.end) + g.dayW - gap / 2;
            const y1 = g.yB(b.balance);
            const share = b.intake ? Math.min(1, b.loggedKcal / b.intake) : 0;
            const color = b.balance < 0 ? DEFICIT : SURPLUS;
            const hatch = `url(#${uid}-${b.balance < 0 ? "d" : "s"})`;
            const split = zero + (y1 - zero) * share;
            const dir = y1 < zero ? -1 : 1;
            const hatchFrom = share > 0 ? split + dir * 2 : zero;
            return (
              <g key={b.start} opacity={hover == null || hover === i ? 1 : 0.5}>
                {share > 0 && <path d={barPath(x0, x1, zero, share < 1 ? split : y1, share >= 1)} fill={color} />}
                {share < 1 && Math.abs(y1 - hatchFrom) > 0.5 && (y1 - hatchFrom) * dir > 0 && (
                  <path d={barPath(x0, x1, hatchFrom, y1, true)} fill={hatch} />
                )}
              </g>
            );
          })}
          <line x1={M.left} x2={width - M.right} y1={zero} y2={zero} stroke="var(--foreground)" strokeOpacity={0.6} strokeWidth={1} />

          {/* Weight panel */}
          <text x={M.left} y={g.wTop - 6} className="fill-muted text-[11px]">
            Trend weight (lb)
          </text>
          {g.tr.length > 0 && (
            <>
              {[g.wHi, g.wLo].map((v) => (
                <g key={v}>
                  <line x1={M.left} x2={width - M.right} y1={g.yW(v)} y2={g.yW(v)} stroke="var(--grid)" strokeWidth={1} />
                  <text x={M.left - 6} y={g.yW(v)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
                    {v.toFixed(1)}
                  </text>
                </g>
              ))}
              <path d={g.wPath} fill="none" stroke="var(--series-trend)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {g.tr
                .filter((t) => t.weighedIn)
                .map((t) => (
                  <circle key={t.day} cx={g.xDay(t.day) + g.dayW / 2} cy={g.yW(t.trend)} r={2.5} fill="var(--series-trend)" stroke="var(--surface)" strokeWidth={1} />
                ))}
            </>
          )}

          {hb && (
            <rect
              x={g.xDay(hb.start)}
              width={g.xDay(hb.end) + g.dayW - g.xDay(hb.start)}
              y={M.top}
              height={HEIGHT - AXIS - M.top}
              fill="var(--foreground)"
              opacity={0.06}
              pointerEvents="none"
            />
          )}

          {g.xLabels.map((d, i) => (
            <text key={d} x={g.xDay(d) + (i === 0 ? 0 : g.dayW / 2)} y={HEIGHT - 6} textAnchor={i === 0 ? "start" : "middle"} className="fill-muted text-[11px]">
              {formatDay(d, { month: "short", day: "numeric" })}
            </text>
          ))}
        </svg>

        {hb && (
          <div
            className="pointer-events-none absolute top-0 space-y-0.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: Math.min(Math.max((g.xDay(hb.start) + g.xDay(hb.end) + g.dayW) / 2 - 85, 0), width - 170), width: 170 }}
          >
            <p className="text-muted">{hb.label ?? formatDay(hb.start)}</p>
            {hb.balance == null ? (
              <p className="text-muted">{hb.intake == null ? "No food logged, and no weigh-ins to estimate from" : "Burn unknown"}</p>
            ) : (
              <p className="flex items-center gap-1.5">
                <SolidSwatch color={hb.balance < 0 ? DEFICIT : SURPLUS} />
                <strong className="tabular-nums">
                  {hb.estimated + hb.partial > 0 ? "≈" : ""}
                  {Math.abs(hb.balance).toLocaleString()}
                </strong>
                <span className="text-muted">{hb.balance < 0 ? "deficit" : "surplus"}</span>
              </p>
            )}
            {hb.intake != null && (
              <p className="tabular-nums">
                Ate {hb.estimated + hb.partial > 0 ? "≈" : ""}
                {hb.intake.toLocaleString()}
                {hb.burn != null && <span className="text-muted"> · burned {hb.burn.toLocaleString()}</span>}
              </p>
            )}
            {hb.logged + hb.partial + hb.estimated > 0 && (
              <p className="text-muted">
                {sourceLine(hb, hb.start === hb.end ? "day" : "week")}
                {hb.start === hb.end && hb.estimated > 0 && hb.windowDays ? `, spread over ${hb.windowDays} days` : ""}
              </p>
            )}
            {hbTrend != null && <p className="text-muted tabular-nums">Trend {hbTrend.toFixed(1)} lb</p>}
          </div>
        )}
      </div>
    </div>
  );
}
