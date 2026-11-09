import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { getWeightHistory } from "@/lib/weight";
import { todayLocal } from "@/lib/today";
import { TrendSummary } from "@/components/trend-summary";
import { WeightView } from "./weight-view";

export default async function WeightPage() {
  const [summary, history, today] = await Promise.all([getProfileSummary(), getWeightHistory(), todayLocal()]);
  if (!summary) redirect("/login");
  const goal = summary.profile.goal_weight_lb == null ? null : Number(summary.profile.goal_weight_lb);
  const latest = history.points.at(-1);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Weight</h1>
      {latest && <TrendSummary trend={latest.trend} rate={history.rateLbPerWeek} goalLb={goal} />}
      <WeightView today={today} entries={history.entries} points={history.points} goalLb={goal} />
    </div>
  );
}
