import Link from "next/link";
import { getExerciseNames, getSessions, getTemplate } from "@/lib/exercise-data";
import { getLatestWeightLb } from "@/lib/weight-latest";
import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { WorkoutForm } from "../workout-form";
import { blankDraft, draftFromTemplate, lastTimeByLift } from "../drafts";

export default async function NewWorkoutPage({ searchParams }: { searchParams: Promise<{ template?: string; activity?: string }> }) {
  const [params, today] = await Promise.all([searchParams, todayLocal()]);
  const [template, names, recent, weight] = await Promise.all([
    params.template ? getTemplate(Number(params.template)) : Promise.resolve(null),
    getExerciseNames(),
    getSessions(addDays(today, -180), today),
    getLatestWeightLb(),
  ]);
  const draft = template ? draftFromTemplate(template, today) : blankDraft(today, params.activity);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Log workout</h1>
          {template && <p className="text-sm text-muted">From template: {template.name}</p>}
        </div>
        <Link href="/exercise" className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <WorkoutForm draft={draft} today={today} latestWeightLb={weight} exerciseNames={names} lastTime={lastTimeByLift(recent)} />
    </div>
  );
}
