import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { todayLocal } from "@/lib/today";
import { formatDay } from "@/lib/dates";
import { TargetCard } from "@/components/target-card";
import { QuickWeighIn } from "@/components/quick-weigh-in";
import { button, card } from "@/components/ui";

export default async function TodayPage() {
  const [summary, history, today] = await Promise.all([getProfileSummary(), getWeightHistory(), todayLocal()]);
  if (!summary) redirect("/login");
  const { profile, target, missing } = summary;
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

      {target ? (
        <TargetCard target={target} override={profile.kcal_target_override} />
      ) : (
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

      <p className="text-center text-xs text-muted">Food, mood and the dashboard are coming in the next steps.</p>
    </div>
  );
}
