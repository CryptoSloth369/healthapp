"use client";

import { useState, useTransition } from "react";
import { deleteWorkout, templateFromWorkout } from "../actions";
import { buttonGhost, card, input } from "@/components/ui";

export function WorkoutExtras({ id, canTemplate }: { id: number; canTemplate: boolean }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      {canTemplate && (
        <section className={`${card} space-y-2`}>
          <p className="text-sm font-semibold">Save as a template</p>
          <div className="flex gap-2">
            <input className={`${input} py-1.5`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push day A" maxLength={80} />
            <button
              type="button"
              disabled={pending || !name.trim()}
              className="shrink-0 rounded-xl border border-accent px-3 text-sm text-accent disabled:opacity-50"
              onClick={() =>
                start(async () => {
                  const r = await templateFromWorkout(id, name);
                  if (r?.error) setError(r.error);
                })
              }
            >
              Save
            </button>
          </div>
          <p className="text-xs text-muted">Uses the saved version of this workout (save any edits first).</p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </section>
      )}
      <button
        type="button"
        disabled={pending}
        className={`${buttonGhost} w-full text-danger`}
        onClick={() => {
          if (confirm("Delete this workout?")) start(() => deleteWorkout(id));
        }}
      >
        Delete workout
      </button>
    </>
  );
}
