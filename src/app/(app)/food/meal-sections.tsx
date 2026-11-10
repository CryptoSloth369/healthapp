import Link from "next/link";
import { MEALS, MEAL_LABELS, servingText, sumNutrients } from "@/lib/nutrition";
import type { FoodEntry } from "@/lib/types";
import { card } from "@/components/ui";

export function MealSections({ entries, day }: { entries: FoodEntry[]; day: string }) {
  return (
    <>
        {MEALS.map((meal) => {
          const items = entries.filter((e) => e.meal === meal);
          const mealKcal = sumNutrients(items).kcal;
          return (
            <section key={meal} className={card}>
              <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{MEAL_LABELS[meal]}</h2>
                {items.length > 0 && <span className="text-sm text-muted">{mealKcal.toLocaleString()} kcal</span>}
              </div>
              {items.length > 0 && (
                <ul className="mt-2 divide-y divide-border">
                  {items.map((e) => (
                    <li key={e.id}>
                      <Link href={`/food/edit/${e.id}`} className="flex items-center justify-between gap-3 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate">
                            {e.name}
                            {e.source === "photo" && (
                              <span className="ml-1.5 text-xs text-muted" title="Estimated from a photo" aria-label="Estimated from a photo">
                                📷
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-muted">
                            {[servingText(e.servings, e.serving), macroLine(e)].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums">{e.kcal.toLocaleString()}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/food/add?meal=${meal}&day=${day}`}
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-accent"
              >
                + Add food
              </Link>
            </section>
          );
        })}
    </>
  );
}

function macroLine(e: { protein_g: number | null; carbs_g: number | null; fat_g: number | null }) {
  if (e.protein_g == null && e.carbs_g == null && e.fat_g == null) return "";
  const f = (v: number | null) => (v == null ? "–" : Math.round(v));
  return `P ${f(e.protein_g)} · C ${f(e.carbs_g)} · F ${f(e.fat_g)}`;
}
