/** Turn stored API messages into chat bubbles. Pure; shared by server and tests. */

export type StoredRow = { role: "user" | "assistant"; content: string | Array<Record<string, unknown>> };
export type Proposal = { id: string; name: string; input: Record<string, unknown> };
export type Turn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; looked: string[]; proposals: Proposal[] };

const LOOKED: Record<string, string> = {
  get_profile_and_goals: "profile",
  get_daily_summary: "daily totals",
  get_food_log: "food log",
  get_workouts: "workouts",
  get_lift_progress: "lifts",
  get_mood_log: "mood",
  get_journal: "journal",
  get_energy_balance: "energy balance",
  get_workout_templates: "templates",
};

export function toDisplay(rows: StoredRow[]): Turn[] {
  const turns: Turn[] = [];
  let cur: Extract<Turn, { role: "assistant" }> | null = null;
  for (const r of rows) {
    if (r.role === "user") {
      const text =
        typeof r.content === "string"
          ? r.content
          : r.content.filter((b) => b.type === "text").map((b) => String(b.text)).join("\n");
      if (!text) continue; // tool results only: same assistant turn continues
      cur = null;
      turns.push({ role: "user", text });
      continue;
    }
    if (!cur) {
      cur = { role: "assistant", text: "", looked: [], proposals: [] };
      turns.push(cur);
    }
    const blocks = typeof r.content === "string" ? [{ type: "text", text: r.content }] : r.content;
    for (const b of blocks) {
      if (b.type === "text" && typeof b.text === "string") cur.text += (cur.text && !cur.text.endsWith("\n") ? "\n\n" : "") + b.text;
      if (b.type === "tool_use" && typeof b.name === "string") {
        if (b.name.startsWith("propose_")) cur.proposals.push({ id: String(b.id), name: b.name, input: (b.input ?? {}) as Record<string, unknown> });
        else if (LOOKED[b.name] && !cur.looked.includes(LOOKED[b.name])) cur.looked.push(LOOKED[b.name]);
      }
    }
  }
  return turns;
}
