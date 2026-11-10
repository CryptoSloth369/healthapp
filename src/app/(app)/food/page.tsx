import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getDayEntries } from "@/lib/food";
import { getBurnedByDay } from "@/lib/exercise-data";
import { todayLocal } from "@/lib/today";
import { addDays, formatDay, isDay } from "@/lib/dates";
import { sumNutrients } from "@/lib/nutrition";
import { MealSections } from "./meal-sections";
import { CalorieSummary } from "@/components/calorie-summary";

export default async function FoodPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const [{ day: dayParam }, today] = await Promise.all([searchParams, todayLocal()]);
  const day = isDay(dayParam) && dayParam <= today ? dayParam : today;
  const [summary, entries, burnedByDay] = await Promise.all([getProfileSummary(), getDayEntries(day), getBurnedByDay(day, day)]);
  if (!summary) redirect("/login");

  const totals = sumNutrients(entries);
  const isToday = day === today;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Food</h1>
        <nav className="flex items-center gap-1" aria-label="Choose day">
          <Link href={`/food?day=${addDays(day, -1)}`} className="rounded-lg px-3 py-1.5 text-lg text-muted" aria-label="Previous day">
            ‹
          </Link>
          <Link href="/food" className="min-w-24 text-center text-sm font-medium">
            {isToday ? "Today" : formatDay(day)}
          </Link>
          {isToday ? (
            <span className="px-3 py-1.5 text-lg text-border" aria-hidden>
              ›
            </span>
          ) : (
            <Link href={`/food?day=${addDays(day, 1)}`} className="rounded-lg px-3 py-1.5 text-lg text-muted" aria-label="Next day">
              ›
            </Link>
          )}
        </nav>
      </header>

      <CalorieSummary
        totals={totals}
        daily={summary.daily}
        burned={burnedByDay.get(day) ?? 0}
        maintenance={summary.target?.tdee ?? null}
      />

      <MealSections entries={entries} day={day} />
    </div>
  );
}
