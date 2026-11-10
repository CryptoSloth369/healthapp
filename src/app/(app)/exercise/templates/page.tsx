import Link from "next/link";
import { getTemplates } from "@/lib/exercise-data";
import { activityLabel } from "@/lib/exercise";
import { button, card } from "@/components/ui";

export default async function TemplatesPage() {
  const templates = await getTemplates();
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Link href="/exercise" className="text-sm text-muted">
          Back
        </Link>
      </header>
      <Link href="/exercise/templates/new" className={`${button} block text-center`}>
        + New template
      </Link>
      {templates.length === 0 ? (
        <p className={`${card} text-sm text-muted`}>
          No templates yet. Create one for workouts you repeat, or open a logged workout and tap “Save as a template”.
        </p>
      ) : (
        templates.map((t) => (
          <section key={t.id} className={`${card} space-y-2`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-semibold">{t.name}</h2>
              <span className="text-xs text-muted">
                {activityLabel(t.activity)}
                {t.duration_min != null && ` · ${t.duration_min} min`}
                {t.distance_mi != null && ` · ${t.distance_mi} mi`}
              </span>
            </div>
            {t.exercises.length > 0 && (
              <ul className="space-y-0.5 text-sm">
                {t.exercises.map((e, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">{e.exercise}</span>
                    <span className="shrink-0 text-muted tabular-nums">
                      {e.sets}×{e.reps ?? "?"}
                      {e.weight_lb != null && ` @ ${e.weight_lb} lb`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 pt-1">
              <Link href={`/exercise/new?template=${t.id}`} className="flex-1 rounded-xl bg-accent px-3 py-2 text-center text-sm font-semibold text-accent-fg">
                Start
              </Link>
              <Link href={`/exercise/templates/${t.id}`} className="flex-1 rounded-xl border border-border px-3 py-2 text-center text-sm">
                Edit
              </Link>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
