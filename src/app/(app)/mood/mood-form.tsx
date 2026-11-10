"use client";

import { useActionState, useState } from "react";
import { saveMood, type MoodFormState } from "./actions";
import { ENERGY_LABELS, MOOD_LABELS, STRESS_LABELS } from "@/lib/mood";
import type { MoodEntry } from "@/lib/types";
import { ScalePicker } from "@/components/scale-picker";
import { TagPicker } from "@/components/tag-picker";
import { button, input, label } from "@/components/ui";

export function MoodForm({
  today,
  entry,
  tagSuggestions,
  sleepLoggedToday,
}: {
  today: string;
  entry: MoodEntry | null;
  tagSuggestions: string[];
  sleepLoggedToday: boolean;
}) {
  const [state, action, pending] = useActionState<MoodFormState, FormData>(saveMood, {});
  const [mood, setMood] = useState<number | null>(entry?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(entry?.energy ?? null);
  const [stress, setStress] = useState<number | null>(entry?.stress ?? null);

  return (
    <form action={action} className="space-y-4">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <ScalePicker name="mood" legend="How do you feel?" labels={MOOD_LABELS} value={mood} onChange={setMood} required />
      <ScalePicker name="energy" legend="Energy" labels={ENERGY_LABELS} value={energy} onChange={setEnergy} />
      <ScalePicker name="stress" legend="Stress" labels={STRESS_LABELS} value={stress} onChange={setStress} />

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>
            Sleep last night <span className="text-xs">(hours)</span>
          </span>
          <input
            className={input}
            name="sleep_hours"
            inputMode="decimal"
            defaultValue={entry?.sleep_hours ?? ""}
            placeholder={sleepLoggedToday && !entry ? "Already logged" : "e.g. 7.5"}
          />
        </label>
        <label className="block">
          <span className={label}>Date</span>
          <input className={input} type="date" name="logged_on" defaultValue={entry?.logged_on ?? today} max={today} required />
        </label>
      </div>

      <TagPicker suggestions={tagSuggestions} initial={entry?.tags ?? []} />

      <label className="block">
        <span className={label}>Note</span>
        <textarea className={`${input} min-h-20`} name="note" defaultValue={entry?.note ?? ""} placeholder="What's going on? (optional)" maxLength={1000} />
      </label>

      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className={`${button} w-full`} disabled={pending || mood == null}>
        {pending ? "Saving…" : entry ? "Save changes" : "Save check-in"}
      </button>
    </form>
  );
}
