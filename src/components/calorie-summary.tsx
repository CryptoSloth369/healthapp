import type { Totals } from "@/lib/nutrition";
import type { Macros } from "@/lib/tdee";
import { Meter } from "./meter";
import { card } from "./ui";

/**
 * Eaten vs budget for one day. Budget = target + calories burned in logged
 * exercise. With `maintenance`, also shows the estimated deficit/surplus:
 * (maintenance + exercise) − eaten.
 */
export function CalorieSummary({
  totals,
  daily,
  burned = 0,
  maintenance = null,
  compact = false,
  children,
}: {
  totals: Totals;
  daily: { kcal: number; macros: Macros } | null;
  burned?: number;
  maintenance?: number | null;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const budget = daily ? daily.kcal + burned : null;
  const left = budget != null ? budget - totals.kcal : null;
  const balance = maintenance != null ? maintenance + burned - totals.kcal : null; // + = deficit
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Calories</p>
          <p className="text-3xl font-semibold">
            {totals.kcal.toLocaleString()}
            {budget != null && <span className="text-base font-normal text-muted"> / {budget.toLocaleString()}</span>}
          </p>
          {daily && burned > 0 && (
            <p className="text-xs text-muted">
              {daily.kcal.toLocaleString()} target + {burned.toLocaleString()} exercise
            </p>
          )}
        </div>
        {left != null && (
          <p className="text-right">
            <span className={`block text-xl font-semibold ${left < 0 ? "text-warn" : ""}`}>{Math.abs(left).toLocaleString()}</span>
            <span className="text-xs text-muted">{left < 0 ? "over" : "left"}</span>
          </p>
        )}
      </div>
      {budget != null && <Meter value={totals.kcal} target={budget} label="Calories eaten vs budget" height={10} />}

      {balance != null && (
        <p className="text-sm">
          <span className="text-muted">Est. {balance >= 0 ? "deficit" : "surplus"} so far: </span>
          <span className="font-semibold">{Math.abs(Math.round(balance)).toLocaleString()} kcal</span>
          <span className="text-xs text-muted"> (maintenance {maintenance!.toLocaleString()}{burned > 0 ? ` + exercise ${burned.toLocaleString()}` : ""} − eaten)</span>
        </p>
      )}

      {!compact && (
        <dl className="grid grid-cols-3 gap-3 pt-1">
          <Macro name="Protein" value={totals.protein} target={daily?.macros.proteinG} />
          <Macro name="Carbs" value={totals.carbs} target={daily?.macros.carbsG} />
          <Macro name="Fat" value={totals.fat} target={daily?.macros.fatG} />
        </dl>
      )}
      {!daily && <p className="text-xs text-muted">Finish your profile to see a calorie target.</p>}
      {children}
    </section>
  );
}

function Macro({ name, value, target }: { name: string; value: number; target?: number }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted">{name}</dt>
      <dd className="text-sm font-medium">
        {value}
        {target != null && <span className="text-muted"> / {target} g</span>}
        {target == null && <span className="text-muted"> g</span>}
      </dd>
      {target != null && <Meter value={value} target={target} label={`${name} vs target`} height={4} />}
    </div>
  );
}
