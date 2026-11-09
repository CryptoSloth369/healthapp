import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { getDayEntries } from "@/lib/food";
import { sumNutrients } from "@/lib/nutrition";
import { CalorieSummary } from "@/components/calorie-summary";
import { todayLocal } from "@/lib/today";
import { formatDay } from "@/lib/dates";
import { QuickWeighIn } from "@/components/quick-weigh-in";
import { button, card } from "@/components/ui";

export default async function TodayPage() {
  const today = await todayLocal();
  const [summary, history, entries] = await Promise.all([getProfileSummary(), getWeightHistory(), getDayEntries(today)]);
  if (!summary) redirect("/login");
  const { profile, missing } = summary;
  const todayEntry = history.entries.find((e) => e.measured_on === today);
  const latest = history.points.at(-1);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">{formatDay(today, { weekday: "long", month: "long", day: "numeric" })}</p>
        <h1 className="text-2xl font-bold">{profile.display_name ? `Hi, ${profile.display_name}` : "Today"}</h1>
      </header>

      <QuickWeighIn
        today={today}
        todayWeight={todayEntry ? Number(todayEntry.weight_lb) : null}
        trend={latest?.trend ?? null}
        rate={history.rateLbPerWeek}
      />

      <CalorieSummary totals={sumNutrients(entries)} daily={summary.daily} compact>
        <div className="flex items-center justify-between pt-1 text-sm">
          <span className="text-muted">
            {entries.length === 0 ? "Nothing logged yet" : `${entries.length} item${entries.length === 1 ? "" : "s"} logged`}
          </span>
          <span className="flex gap-4">
            <Link href="/food" className="text-muted">
              View day
            </Link>
            <Link href="/food/add" className="font-medium text-accent">
              + Log food
            </Link>
          </span>
        </div>
      </CalorieSummary>

      {missing.length > 0 && (
        <section className={`${card} space-y-3`}>
          <p className="font-semibold">Finish setting up your profile</p>
          <p className="text-sm text-muted">
            Missing: {missing.join(", ")}. These are needed to calculate your calorie target.
          </p>
          <Link href="/profile" className={`${button} inline-block`}>
            Set up profile
          </Link>
        </section>
      )}

      <p className="text-center text-xs text-muted">Mood, exercise and the dashboard are coming in the next steps.</p>
    </div>
  );
}
