import type { Totals } from "@/lib/nutrition";
import type { Macros } from "@/lib/tdee";
import { Meter } from "./meter";
import { card } from "./ui";

/** Eaten vs target for one day, with macro meters. */
export function CalorieSummary({
  totals,
  daily,
  compact = false,
  children,
}: {
  totals: Totals;
  daily: { kcal: number; macros: Macros } | null;
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const left = daily ? daily.kcal - totals.kcal : null;
  return (
    <section className={`${card} space-y-3`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Calories</p>
          <p className="text-3xl font-semibold">
            {totals.kcal.toLocaleString()}
            {daily && <span className="text-base font-normal text-muted"> / {daily.kcal.toLocaleString()}</span>}
          </p>
        </div>
        {left != null && (
          <p className="text-right">
            <span className={`block text-xl font-semibold ${left < 0 ? "text-warn" : ""}`}>
              {Math.abs(left).toLocaleString()}
            </span>
            <span className="text-xs text-muted">{left < 0 ? "over" : "left"}</span>
          </p>
        )}
      </div>
      {daily && <Meter value={totals.kcal} target={daily.kcal} label="Calories eaten vs target" height={10} />}

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
