import type { CalorieTarget } from "@/lib/tdee";
import { formatLongDate } from "@/lib/dates";
import { card } from "./ui";

export function TargetCard({ target, override }: { target: CalorieTarget; override: number | null }) {
  const kcal = override ?? target.targetKcal;
  const rate = target.plannedLbPerWeek;
  return (
    <section className={card}>
      <p className="text-sm text-muted">Daily calorie target</p>
      <p className="text-4xl font-bold tabular-nums">
        {kcal.toLocaleString()} <span className="text-base font-normal text-muted">kcal</span>
      </p>
      {override != null && <p className="text-xs text-warn">Manual override (calculated: {target.targetKcal.toLocaleString()})</p>}

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <Stat label="BMR" value={target.bmr.toLocaleString()} />
        <Stat label="TDEE" value={target.tdee.toLocaleString()} />
        <Stat
          label="Pace"
          value={rate === 0 ? "Maintain" : `${rate > 0 ? "+" : ""}${rate} lb/wk`}
        />
      </dl>

      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <Stat label="Protein" value={`${target.macros.proteinG} g`} />
        <Stat label="Carbs" value={`${target.macros.carbsG} g`} />
        <Stat label="Fat" value={`${target.macros.fatG} g`} />
      </dl>

      {target.projectedGoalDate && (
        <p className="mt-3 text-sm text-muted">
          Projected to reach your goal around{" "}
          <span className="text-foreground">{formatLongDate(target.projectedGoalDate)}</span>.
        </p>
      )}
      {target.warnings.map((w) => (
        <p key={w} className="mt-2 text-sm text-warn">{w}</p>
      ))}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background px-2 py-1.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
