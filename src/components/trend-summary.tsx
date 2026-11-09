import { card } from "./ui";

/** Current trend weight, weekly rate, and distance to goal. */
export function TrendSummary({
  trend,
  rate,
  goalLb,
}: {
  trend: number;
  rate: number | null;
  goalLb: number | null;
}) {
  const toGo = goalLb == null ? null : Math.round((goalLb - trend) * 10) / 10;
  return (
    <section className={`${card} grid grid-cols-3 gap-2`}>
      <Stat label="Trend weight" value={`${trend.toFixed(1)} lb`} />
      <Stat
        label="Per week"
        value={rate == null ? "—" : `${rate > 0 ? "+" : ""}${rate.toFixed(1)} lb`}
        hint={rate == null ? "Needs ~1 week of data" : undefined}
      />
      <Stat
        label="To goal"
        value={toGo == null ? "—" : toGo === 0 ? "At goal" : `${toGo > 0 ? "+" : ""}${toGo} lb`}
        hint={goalLb == null ? "Set in Profile" : undefined}
      />
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
      {hint && <p className="text-[11px] leading-tight text-muted">{hint}</p>}
    </div>
  );
}
