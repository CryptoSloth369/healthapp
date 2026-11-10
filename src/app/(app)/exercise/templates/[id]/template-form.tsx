"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteTemplate, saveTemplate } from "../../actions";
import { ACTIVITIES, COMMON_LIFTS, type Activity } from "@/lib/exercise";
import type { WorkoutTemplate } from "@/lib/types";
import { button, buttonGhost, card, input, label } from "@/components/ui";

type Row = { key: number; exercise: string; sets: string; reps: string; weight: string };
let nextKey = 1;
const s = (v: number | null | undefined) => (v == null ? "" : String(v));
const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function TemplateForm({ template, exerciseNames }: { template: WorkoutTemplate | null; exerciseNames: string[] }) {
  const [name, setName] = useState(template?.name ?? "");
  const [activity, setActivity] = useState<Activity>((template?.activity as Activity) ?? "weightlifting");
  const [duration, setDuration] = useState(s(template?.duration_min));
  const [distance, setDistance] = useState(s(template?.distance_mi));
  const [note, setNote] = useState(template?.note ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    template?.exercises.length
      ? template.exercises.map((e) => ({ key: nextKey++, exercise: e.exercise, sets: String(e.sets), reps: s(e.reps), weight: s(e.weight_lb) }))
      : [{ key: nextKey++, exercise: "", sets: "3", reps: "", weight: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = ACTIVITIES[activity] ?? ACTIVITIES.other;
  const names = useMemo(() => [...new Set([...exerciseNames, ...COMMON_LIFTS])], [exerciseNames]);
  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-4`}>
        <label className="block">
          <span className={label}>Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Push day A" maxLength={80} />
        </label>
        <fieldset>
          <legend className="mb-1 text-sm text-muted">Activity</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(ACTIVITIES) as Activity[]).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={activity === a}
                onClick={() => setActivity(a)}
                className={`rounded-xl border px-2 py-2 text-sm ${activity === a ? "border-accent bg-accent/15" : "border-border text-muted"}`}
              >
                {ACTIVITIES[a].label}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className={label}>Usual time (min)</span>
            <input className={input} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} />
          </label>
          {act.distance && (
            <label className="block">
              <span className={label}>Usual miles</span>
              <input className={input} inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} />
            </label>
          )}
        </div>
      </section>

      {act.sets && (
        <section className={`${card} space-y-2`}>
          <datalist id="tpl-lift-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <h2 className="font-semibold">Exercises</h2>
          <div className="grid grid-cols-[1fr_3rem_3.5rem_4.5rem_1.5rem] gap-1.5 text-xs text-muted">
            <span>Exercise</span>
            <span>Sets</span>
            <span>Reps</span>
            <span>Weight</span>
            <span />
          </div>
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[1fr_3rem_3.5rem_4.5rem_1.5rem] items-center gap-1.5">
              <input className={`${input} px-2 py-1.5 text-sm`} list="tpl-lift-names" value={r.exercise} onChange={(e) => update(r.key, { exercise: e.target.value })} placeholder="Exercise" aria-label="Exercise" />
              <input className={`${input} px-2 py-1.5 text-sm`} inputMode="numeric" value={r.sets} onChange={(e) => update(r.key, { sets: e.target.value })} aria-label="Sets" />
              <input className={`${input} px-2 py-1.5 text-sm`} inputMode="numeric" value={r.reps} onChange={(e) => update(r.key, { reps: e.target.value })} aria-label="Reps" />
              <input className={`${input} px-2 py-1.5 text-sm`} inputMode="decimal" value={r.weight} onChange={(e) => update(r.key, { weight: e.target.value })} placeholder="lb" aria-label="Weight" />
              <button type="button" className="text-muted" aria-label="Remove exercise" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-accent"
            onClick={() => setRows((rs) => [...rs, { key: nextKey++, exercise: "", sets: "3", reps: "", weight: "" }])}
          >
            + Add exercise
          </button>
          <p className="text-xs text-muted">Weight is optional; starting the template pre-fills these and you adjust on the day.</p>
        </section>
      )}

      <section className={`${card} space-y-3`}>
        <label className="block">
          <span className={label}>Note</span>
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="button"
          className={`${button} w-full`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveTemplate({
                id: template?.id ?? null,
                name,
                activity,
                durationMin: num(duration),
                distanceMi: act.distance ? num(distance) : null,
                note,
                exercises: rows.map((x) => ({ exercise: x.exercise, sets: Number(x.sets) || 1, reps: num(x.reps), weight_lb: num(x.weight) })),
              });
              if (r?.error) setError(r.error);
            })
          }
        >
          {pending ? "Saving…" : "Save template"}
        </button>
      </section>

      {template && (
        <button
          type="button"
          disabled={pending}
          className={`${buttonGhost} w-full text-danger`}
          onClick={() => {
            if (confirm(`Delete the "${template.name}" template? Past workouts are kept.`)) start(() => deleteTemplate(template.id));
          }}
        >
          Delete template
        </button>
      )}
    </div>
  );
}
