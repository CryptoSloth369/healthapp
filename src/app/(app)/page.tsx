import Link from "next/link";
import { redirect } from "next/navigation";
import { getProfileSummary } from "@/lib/profile";
import { TargetCard } from "@/components/target-card";
import { button, card } from "@/components/ui";

export default async function TodayPage() {
  const summary = await getProfileSummary();
  if (!summary) redirect("/login");
  const { profile, target, missing, latestWeight } = summary;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
        <h1 className="text-2xl font-bold">
          {profile.display_name ? `Hi, ${profile.display_name}` : "Today"}
        </h1>
      </header>

      {target ? (
        <TargetCard target={target} override={profile.kcal_target_override} />
      ) : (
        <section className={`${card} space-y-3`}>
          <p className="font-semibold">Finish setting up your profile</p>
          <p className="text-sm text-muted">
            Missing: {missing.join(", ")}. These are needed to calculate your calorie target.
          </p>
          <Link href="/profile" className={`${button} inline-block`}>Set up profile</Link>
        </section>
      )}

      {latestWeight && (
        <section className={card}>
          <p className="text-sm text-muted">Latest weight</p>
          <p className="text-2xl font-semibold tabular-nums">
            {Number(latestWeight.weight_lb).toFixed(1)} lb
          </p>
          <p className="text-xs text-muted">{latestWeight.measured_on}</p>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        Food, weight history, mood and the dashboard are coming in the next steps.
      </p>
    </div>
  );
}
