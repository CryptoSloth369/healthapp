"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/finance";
import { sliceColor, type Slice } from "./slice-color";


const SIZE = 220;
const R = 100;
const r = 62;

/**
 * Spending by category as a donut, with the total in the middle. Tapping a
 * slice shows its amount and share there. Slices are separated by a 2px gap.
 */
export function SpendingDonut({ slices, total }: { slices: Slice[]; total: number }) {
  const [active, setActive] = useState<number | null>(null);
  const c = SIZE / 2;
  // Start angle of each slice = top of the circle + the share of all slices before it.
  const sweeps = slices.map((s) => (total > 0 ? (s.total / total) * Math.PI * 2 : 0));
  const starts = sweeps.map((_, i) => -Math.PI / 2 + sweeps.slice(0, i).reduce((x, y) => x + y, 0));
  const arcs = slices.map((s, i) => ({ s, i, d: arc(c, starts[i], starts[i] + sweeps[i], slices.length > 1) }));
  const a = active == null ? null : slices[active];

  return (
    <div className="flex justify-center">
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Spending by category, ${formatMoney(total)} total`}
        className="select-none"
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
      >
        {arcs.map(({ s, i, d }) => (
          <path
            key={s.key}
            d={d}
            fill={sliceColor(s, i)}
            stroke="var(--surface)"
            strokeWidth={2}
            opacity={active == null || active === i ? 1 : 0.4}
            onPointerEnter={() => setActive(i)}
            onPointerDown={() => setActive(active === i ? null : i)}
          >
            <title>{`${s.label}: ${formatMoney(s.total)}`}</title>
          </path>
        ))}
        <text x={c} y={c - 8} textAnchor="middle" className="fill-muted text-[12px]">
          {a ? a.label : "Spent"}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="fill-foreground text-[22px] font-semibold tabular-nums">
          {formatMoney(a ? a.total : total)}
        </text>
        {a && (
          <text x={c} y={c + 34} textAnchor="middle" className="fill-muted text-[12px] tabular-nums">
            {Math.round((a.total / total) * 100)}% · {a.count} {a.count === 1 ? "purchase" : "purchases"}
          </text>
        )}
      </svg>
    </div>
  );
}

/** One donut segment between two angles. A single slice is a full ring. */
function arc(c: number, a0: number, a1: number, gaps: boolean) {
  if (!gaps || a1 - a0 >= Math.PI * 2 - 1e-6) {
    return `M${c + R},${c}A${R},${R} 0 1 1 ${c - R},${c}A${R},${R} 0 1 1 ${c + R},${c}ZM${c + r},${c}A${r},${r} 0 1 0 ${c - r},${c}A${r},${r} 0 1 0 ${c + r},${c}Z`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (rad: number, a: number) => `${(c + rad * Math.cos(a)).toFixed(2)},${(c + rad * Math.sin(a)).toFixed(2)}`;
  return `M${p(R, a0)}A${R},${R} 0 ${large} 1 ${p(R, a1)}L${p(r, a1)}A${r},${r} 0 ${large} 0 ${p(r, a0)}Z`;
}
