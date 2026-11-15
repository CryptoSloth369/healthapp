import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getEntriesBetween } from "@/lib/food";
import { getMoodEntries } from "@/lib/mood-data";
import { getSessions } from "@/lib/exercise-data";
import { ensureFreshEnergy, getEnergyDays } from "@/lib/energy-data";
import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { DashboardView, RANGES, STREAK_WINDOW, type RangeKey } from "./dashboard-view";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const [{ range: rangeParam }, today] = await Promise.all([searchParams, todayLocal()]);
  const range: RangeKey = rangeParam && rangeParam in RANGES ? (rangeParam as RangeKey) : "4w";
  const start = addDays(today, -(RANGES[range].days - 1));
  const streakStart = addDays(today, -STREAK_WINDOW);
  const fetchStart = streakStart < start ? streakStart : start;

  // Rerun the energy model first if anything changed or a new day has finished.
  const [summary, history, energy] = await Promise.all([getProfileSummary(), getWeightHistory(), ensureFreshEnergy(today)]);
  if (!summary) redirect("/login");

  const [entries, moods, workouts, energyDays] = await Promise.all([
    getEntriesBetween(fetchStart, today),
    getMoodEntries(start, today),
    getSessions(start, today),
    getEnergyDays(start, addDays(today, -1)),
  ]);
  return (
    <DashboardView
      range={range}
      today={today}
      summary={summary}
      history={history}
      entries={entries}
      moods={moods}
      workouts={workouts}
      energyDays={energyDays}
      energy={energy}
      now={new Date().toISOString()}
    />
  );
}
