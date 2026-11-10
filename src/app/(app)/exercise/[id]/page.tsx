import Link from "next/link";
import { notFound } from "next/navigation";
import { getExerciseNames, getSession, getSessions } from "@/lib/exercise-data";
import { getLatestWeightLb } from "@/lib/weight-latest";
import { todayLocal } from "@/lib/today";
import { addDays, formatDay } from "@/lib/dates";
import { ACTIVITIES, isActivity } from "@/lib/exercise";
import { WorkoutForm } from "../workout-form";
import { draftFromSession, lastTimeByLift } from "../drafts";
import { WorkoutExtras } from "./workout-extras";

export default async function EditWorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const today = await todayLocal();
  const [session, names, recent, weight] = await Promise.all([
    getSession(Number(id)),
    getExerciseNames(),
    getSessions(addDays(today, -180), today),
    getLatestWeightLb(),
  ]);
  if (!session) notFound();
  const canTemplate = isActivity(session.activity) && (ACTIVITIES[session.activity].sets ? session.sets.length > 0 : true);

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Edit workout</h1>
          <p className="text-sm text-muted">{formatDay(session.performed_on)}</p>
        </div>
        <Link href="/exercise" className="text-sm text-muted">
          Cancel
        </Link>
      </header>
      <WorkoutForm
        draft={draftFromSession(session)}
        today={today}
        latestWeightLb={weight}
        exerciseNames={names}
        lastTime={lastTimeByLift(recent, session.id)}
      />
      <WorkoutExtras id={session.id} canTemplate={canTemplate} />
    </div>
  );
}
