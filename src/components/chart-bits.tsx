/**
 * Shared SVG pieces for the bar charts. Logged values are solid; values
 * back-calculated from weight use a diagonal hatch of the same color, so the
 * two never rely on color alone.
 */

/** `<defs>` entry: a light tint with 45° stripes in `color`. Reference as `url(#id)`. */
export function HatchPattern({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
      <rect width="5" height="5" fill={color} fillOpacity="0.28" />
      <line x1="1" y1="0" x2="1" y2="5" stroke={color} strokeWidth="2" />
    </pattern>
  );
}

/**
 * A bar from y0 (baseline side) to y1 (data end), x from x0 to x1. The data
 * end is rounded when `round`; the baseline end stays square. Works upward
 * (y1 < y0) and downward (y1 > y0).
 */
export function barPath(x0: number, x1: number, y0: number, y1: number, round: boolean): string {
  const h = Math.abs(y0 - y1);
  const r = round ? Math.min(4, (x1 - x0) / 2, h) : 0;
  const dir = y1 < y0 ? 1 : -1; // 1 = bar grows upward
  return `M${x0},${y0}V${y1 + dir * r}Q${x0},${y1} ${x0 + r},${y1}H${x1 - r}Q${x1},${y1} ${x1},${y1 + dir * r}V${y0}Z`;
}

/** Legend swatches. */
export function SolidSwatch({ color }: { color: string }) {
  return (
    <svg width="10" height="10" aria-hidden className="shrink-0">
      <rect width="10" height="10" rx="2" fill={color} />
    </svg>
  );
}

export function HatchSwatch({ color, id }: { color: string; id: string }) {
  return (
    <svg width="10" height="10" aria-hidden className="shrink-0">
      <defs>
        <HatchPattern id={id} color={color} />
      </defs>
      <rect width="10" height="10" rx="2" fill={`url(#${id})`} />
    </svg>
  );
}
