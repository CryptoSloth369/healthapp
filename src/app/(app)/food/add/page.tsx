import Link from "next/link";
import { getQuickPicks } from "@/lib/food";
import { todayLocal } from "@/lib/today";
import { formatDay, isDay } from "@/lib/dates";
import { isMeal, MEAL_LABELS } from "@/lib/nutrition";
import { AddFood } from "./add-food";

export default async function AddFoodPage({
  searchParams,
}: {
  searchParams: Promise<{ meal?: string; day?: string }>;
}) {
  const [params, today, picks] = await Promise.all([searchParams, todayLocal(), getQuickPicks()]);
  const day = isDay(params.day) && params.day <= today ? params.day : today;
  // No meal given (e.g. from Today): the client picks one from the time of day.
  const meal = isMeal(params.meal) ? params.meal : null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Add food</h1>
          <p className="text-sm text-muted">
            {meal ? MEAL_LABELS[meal] + " · " : ""}
            {day === today ? "Today" : formatDay(day)}
          </p>
        </div>
        <Link href={`/food?day=${day}`} className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <AddFood day={day} meal={meal} picks={picks} />
    </div>
  );
}
