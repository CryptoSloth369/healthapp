import Link from "next/link";
import { todayLocal } from "@/lib/today";
import { formatDay, isDay } from "@/lib/dates";
import { isMeal } from "@/lib/nutrition";
import { PhotoEstimator } from "./photo-estimator";

// The estimate can take 10–30 seconds; give the server action room.
export const maxDuration = 60;

export default async function PhotoPage({ searchParams }: { searchParams: Promise<{ meal?: string; day?: string }> }) {
  const [params, today] = await Promise.all([searchParams, todayLocal()]);
  const day = isDay(params.day) && params.day <= today ? params.day : today;
  const meal = isMeal(params.meal) ? params.meal : null;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Photo estimate</h1>
          <p className="text-sm text-muted">{day === today ? "Today" : formatDay(day)}</p>
        </div>
        <Link href={`/food/add?day=${day}${meal ? `&meal=${meal}` : ""}`} className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <PhotoEstimator day={day} meal={meal} />
    </div>
  );
}
