/**
 * Weight trend smoothing.
 *
 * Daily weight swings 1–4 lb with water, salt and food in the gut, which hides
 * the real direction. We smooth with an exponentially weighted moving average
 * (10% of each new reading, the "Hacker's Diet" approach). Missing days are
 * handled by applying the daily factor once per elapsed day.
 */

export const DAILY_SMOOTHING = 0.1;
const MS_PER_DAY = 86_400_000;

export type WeighIn = { day: string; weight: number }; // day = "YYYY-MM-DD"
export type TrendPoint = WeighIn & { trend: number };

/** Whole days between two "YYYY-MM-DD" strings (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / MS_PER_DAY);
}

/** Entries must be sorted by day ascending, one per day. */
export function computeTrend(entries: WeighIn[], alpha = DAILY_SMOOTHING): TrendPoint[] {
  const out: TrendPoint[] = [];
  let trend: number | null = null;
  let prevDay: string | null = null;
  for (const e of entries) {
    if (trend === null || prevDay === null) {
      trend = e.weight;
    } else {
      const gap = Math.max(1, daysBetween(prevDay, e.day));
      const k = 1 - Math.pow(1 - alpha, gap);
      trend = trend + k * (e.weight - trend);
    }
    prevDay = e.day;
    out.push({ ...e, trend: Math.round(trend * 100) / 100 });
  }
  return out;
}

/**
 * Trend change in lb/week over the last `windowDays`, from a least-squares fit
 * of the trend line. Null if there isn't enough data to say.
 */
export function weeklyRate(points: TrendPoint[], windowDays = 14): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1].day;
  const recent = points.filter((p) => daysBetween(p.day, last) <= windowDays);
  if (recent.length < 3) return null;
  const xs = recent.map((p) => -daysBetween(p.day, last));
  if (Math.max(...xs) - Math.min(...xs) < 5) return null;
  const ys = recent.map((p) => p.trend);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? null : Math.round((num / den) * 7 * 100) / 100;
}
