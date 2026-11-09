"use client";

import { useActionState, useState } from "react";
import { saveFoodEntry, type EntryFormState } from "./actions";
import { MEALS, MEAL_LABELS, kcalFromMacros, type Meal } from "@/lib/nutrition";
import { button, input, label } from "@/components/ui";

/** Values are PER SERVING. */
export type EntryDraft = {
  name: string;
  serving: string | null;
  servings: number;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  note?: string | null;
  savedFoodId: number | null;
};

const s = (v: number | null | undefined) => (v == null ? "" : String(v));

export function EntryForm({
  id,
  day,
  meal,
  draft,
  submitLabel,
}: {
  id?: number;
  day: string;
  meal: Meal;
  draft: EntryDraft | null;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<EntryFormState, FormData>(saveFoodEntry, {});
  const [servings, setServings] = useState(s(draft?.servings ?? 1));
  const [kcal, setKcal] = useState(s(draft?.kcal));
  const [p, setP] = useState(s(draft?.protein_g));
  const [c, setC] = useState(s(draft?.carbs_g));
  const [f, setF] = useState(s(draft?.fat_g));

  const nServ = Number(servings) || 0;
  const nKcal = Number(kcal) || 0;
  const total = Math.round(nKcal * nServ);
  const hasMacros = p !== "" || c !== "" || f !== "";
  const macroKcal = kcalFromMacros(Number(p) || 0, Number(c) || 0, Number(f) || 0);
  const mismatch = hasMacros && nKcal > 0 && Math.abs(macroKcal - nKcal) > Math.max(40, nKcal * 0.2);

  return (
    <form action={action} className="space-y-3">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="eaten_on" value={day} />
      {draft?.savedFoodId && <input type="hidden" name="saved_food_id" value={draft.savedFoodId} />}

      <label className="block">
        <span className={label}>Food</span>
        <input className={input} name="name" defaultValue={draft?.name ?? ""} placeholder="e.g. Greek yogurt" maxLength={120} />
      </label>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <label className="block">
          <span className={label}>Serving size</span>
          <input className={input} name="serving" defaultValue={draft?.serving ?? ""} placeholder="e.g. 1 cup, 170 g" />
        </label>
        <label className="block">
          <span className={label}>Servings</span>
          <input className={input} name="servings" inputMode="decimal" value={servings} onChange={(e) => setServings(e.target.value)} />
        </label>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <label className="block">
          <span className={label}>kcal</span>
          <input className={input} name="kcal" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} required />
        </label>
        <label className="block">
          <span className={label}>Protein</span>
          <input className={input} name="protein_g" inputMode="decimal" value={p} onChange={(e) => setP(e.target.value)} placeholder="g" />
        </label>
        <label className="block">
          <span className={label}>Carbs</span>
          <input className={input} name="carbs_g" inputMode="decimal" value={c} onChange={(e) => setC(e.target.value)} placeholder="g" />
        </label>
        <label className="block">
          <span className={label}>Fat</span>
          <input className={input} name="fat_g" inputMode="decimal" value={f} onChange={(e) => setF(e.target.value)} placeholder="g" />
        </label>
      </div>
      <p className="text-xs text-muted">
        Values are per serving.
        {nServ > 0 && nServ !== 1 && nKcal > 0 && (
          <>
            {" "}
            Total: <span className="text-foreground">{total.toLocaleString()} kcal</span>
          </>
        )}
      </p>
      {mismatch && (
        <p className="text-xs text-warn">Heads up: these macros add up to about {macroKcal} kcal per serving.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>Meal</span>
          <select className={input} name="meal" defaultValue={meal}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={label}>Note</span>
          <input className={input} name="note" defaultValue={draft?.note ?? ""} placeholder="Optional" />
        </label>
      </div>

      {!draft?.savedFoodId && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="save_to_foods" className="h-4 w-4 accent-[var(--accent)]" />
          Save to My foods for quick re-logging
        </label>
      )}

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className={`${button} w-full`} disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
