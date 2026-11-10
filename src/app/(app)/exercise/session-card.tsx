import Link from "next/link";
import { activityLabel, pace, volume } from "@/lib/exercise";
import type { ExerciseSession } from "@/lib/types";
import { setSummary } from "./drafts";

export function SessionCard({ s }: { s: ExerciseSession }) {
  const lifts = setSummary(s);
  const vol = volume(s.sets);
  const meta = [
    s.duration_min != null && `${s.duration_min} min`,
    s.distance_mi != null && `${s.distance_mi} mi`,
    pace(s.duration_min, s.distance_mi),
    vol > 0 && `${vol.toLocaleString()} lb volume`,
  ].filter(Boolean);
  return (
    <Link href={`/exercise/${s.id}`} className="block py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-medium">{activityLabel(s.activity)}</span>
        {s.kcal_burned != null && (
          <span className="shrink-0 text-sm tabular-nums">
            {s.kcal_burned.toLocaleString()} kcal{s.kcal_estimated && <span className="text-muted"> est.</span>}
          </span>
        )}
      </div>
      {meta.length > 0 && <p className="text-xs text-muted">{meta.join(" · ")}</p>}
      {lifts.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-sm">
          {lifts.map((l, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{l.exercise}</span>
              <span className="shrink-0 text-muted tabular-nums">{l.text}</span>
            </li>
          ))}
        </ul>
      )}
      {s.note && <p className="mt-1 text-sm text-muted">{s.note}</p>}
    </Link>
  );
}
