import { createClient, getUserId } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

const DATASETS = {
  food: {
    table: "food_entry",
    order: "eaten_at",
    columns: ["eaten_on", "meal", "name", "servings", "serving", "kcal", "protein_g", "carbs_g", "fat_g", "source", "ai_confidence", "note", "eaten_at"],
  },
  weight: { table: "weight_entry", order: "measured_on", columns: ["measured_on", "weight_lb", "body_fat_pct", "note"] },
  exercise: {
    table: "exercise_entry",
    order: "performed_at",
    columns: ["id", "performed_on", "activity", "duration_min", "distance_mi", "kcal_burned", "kcal_estimated", "note", "performed_at"],
  },
  "exercise-sets": { table: "exercise_set", order: "entry_id", columns: ["entry_id", "position", "exercise", "weight_lb", "reps"] },
  mood: { table: "mood_entry", order: "logged_at", columns: ["logged_on", "logged_at", "mood", "energy", "stress", "sleep_hours", "tags", "note"] },
  journal: { table: "journal_entry", order: "written_at", columns: ["written_on", "written_at", "updated_at", "body"] },
} as const;
type Dataset = keyof typeof DATASETS;

async function fetchAll(table: string, order: string) {
  const supabase = await createClient();
  const rows: Record<string, unknown>[] = [];
  // Page through in chunks (PostgREST caps rows per request).
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").order(order).range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function GET(_req: Request, { params }: { params: Promise<{ dataset: string }> }) {
  if (!(await getUserId())) return new Response("Signed out", { status: 401 });
  const { dataset } = await params;
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    if (dataset === "all") {
      const backup: Record<string, unknown> = { exported_at: new Date().toISOString() };
      for (const [name, d] of Object.entries(DATASETS)) backup[name] = await fetchAll(d.table, d.order);
      const supabase = await createClient();
      backup.profile = (await supabase.from("profile").select("*").maybeSingle()).data;
      backup.saved_foods = await fetchAll("saved_food", "name");
      backup.workout_templates = (await supabase.from("workout_template").select("*, exercises:template_exercise(*)")).data;
      return new Response(JSON.stringify(backup, null, 2), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="health-backup-${stamp}.json"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (!(dataset in DATASETS)) return new Response("Unknown dataset", { status: 404 });
    const d = DATASETS[dataset as Dataset];
    const rows = await fetchAll(d.table, d.order);
    return new Response("﻿" + toCsv(rows, [...d.columns]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="health-${dataset}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("export failed", err);
    return new Response("Export failed", { status: 500 });
  }
}
