import { card } from "@/components/ui";

const ITEMS = [
  ["food", "Food log"],
  ["weight", "Weigh-ins"],
  ["exercise", "Workouts"],
  ["exercise-sets", "Lifting sets"],
  ["mood", "Mood check-ins"],
] as const;

export function ExportCard() {
  return (
    <section className={`${card} space-y-2`}>
      <h2 className="font-semibold">Export your data</h2>
      <p className="text-xs text-muted">Spreadsheet-ready CSV files, or a full backup of everything as JSON.</p>
      <div className="grid grid-cols-2 gap-2">
        {ITEMS.map(([key, label]) => (
          <a key={key} href={`/api/export/${key}`} download className="rounded-xl border border-border px-3 py-2 text-center text-sm">
            {label} <span className="text-muted">CSV</span>
          </a>
        ))}
        <a href="/api/export/all" download className="rounded-xl border border-accent/60 px-3 py-2 text-center text-sm text-accent">
          Full backup <span className="opacity-70">JSON</span>
        </a>
      </div>
    </section>
  );
}
