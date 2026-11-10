"use client";

import { useMemo, useState, useTransition } from "react";
import { saveWorkout } from "./actions";
import { ACTIVITIES, COMMON_LIFTS, estimateKcal, isActivity, liftKey, pace, volume, type Activity } from "@/lib/exercise";
import { button, buttonGhost, card, input, label } from "@/components/ui";

type SetDraft = { key: number; weight: string; reps: string };
type BlockDraft = { key: number; exercise: string; sets: SetDraft[] };

export type WorkoutDraft = {
  id: number | null;
  day: string;
  activity: Activity;
  duration: string;
  distance: string;
  kcal: string;
  note: string;
  templateId: number | null;
  blocks: { exercise: string; sets: { weight: string; reps: string }[] }[];
};

let nextKey = 1;
const k = () => nextKey++;
const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function WorkoutForm({
  draft,
  today,
  latestWeightLb,
  exerciseNames,
  lastTime,
}: {
  draft: WorkoutDraft;
  today: string;
  latestWeightLb: number | null;
  exerciseNames: string[];
  lastTime: Record<string, string>; // liftKey → "185×8, 185×8 · Nov 3"
}) {
  const [activity, setActivity] = useState<Activity>(draft.activity);
  const [day, setDay] = useState(draft.day);
  const [duration, setDuration] = useState(draft.duration);
  const [distance, setDistance] = useState(draft.distance);
  const [kcal, setKcal] = useState(draft.kcal);
  const [note, setNote] = useState(draft.note);
  const [blocks, setBlocks] = useState<BlockDraft[]>(() =>
    draft.blocks.map((b) => ({ key: k(), exercise: b.exercise, sets: b.sets.map((s) => ({ key: k(), ...s })) })),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();

  const act = ACTIVITIES[activity];
  const names = useMemo(() => [...new Set([...exerciseNames, ...COMMON_LIFTS])], [exerciseNames]);
  const estimate = estimateKcal({
    activity,
    durationMin: num(duration),
    distanceMi: act.distance ? num(distance) : null,
    weightLb: latestWeightLb,
  });
  const flatSets = blocks.flatMap((b) =>
    b.sets.map((s) => ({ exercise: b.exercise, weight_lb: num(s.weight), reps: Number(s.reps) || 0 })),
  );
  const totalVolume = volume(flatSets);

  function setBlock(key: number, patch: Partial<BlockDraft>) {
    setBlocks((bs) => bs.map((b) => (b.key === key ? { ...b, ...patch } : b)));
  }
  function setSet(bKey: number, sKey: number, patch: Partial<SetDraft>) {
    setBlocks((bs) => bs.map((b) => (b.key === bKey ? { ...b, sets: b.sets.map((s) => (s.key === sKey ? { ...s, ...patch } : s)) } : b)));
  }
  function addSet(bKey: number) {
    setBlocks((bs) =>
      bs.map((b) => {
        if (b.key !== bKey) return b;
        const last = b.sets[b.sets.length - 1];
        return { ...b, sets: [...b.sets, { key: k(), weight: last?.weight ?? "", reps: last?.reps ?? "" }] };
      }),
    );
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await saveWorkout({
        id: draft.id,
        day,
        activity,
        durationMin: num(duration),
        distanceMi: act.distance ? num(distance) : null,
        kcal: num(kcal),
        note,
        templateId: draft.templateId,
        sets: act.sets ? flatSets : [],
      });
      if (r?.error) setError(r.error);
    });
  }

  return (
    <div className="space-y-4">
      <section className={`${card} space-y-4`}>
        <fieldset>
          <legend className="mb-1 text-sm text-muted">Activity</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(ACTIVITIES) as Activity[]).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={activity === a}
                onClick={() => {
                  if (!isActivity(a)) return;
                  setActivity(a);
                  // Switching to lifting with no exercises yet: start one empty block.
                  if (ACTIVITIES[a].sets && blocks.length === 0)
                    setBlocks([{ key: k(), exercise: "", sets: [{ key: k(), weight: "", reps: "" }] }]);
                }}
                className={`rounded-xl border px-2 py-2 text-sm ${activity === a ? "border-accent bg-accent/15" : "border-border text-muted"}`}
              >
                {ACTIVITIES[a].label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className={`grid gap-3 ${act.distance ? "grid-cols-3" : "grid-cols-2"}`}>
          <label className="block">
            <span className={label}>Time (min)</span>
            <input className={input} inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" />
          </label>
          {act.distance && (
            <label className="block">
              <span className={label}>Miles</span>
              <input className={input} inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="3.1" />
            </label>
          )}
          <label className="block">
            <span className={label}>Date</span>
            <input className={`${input} px-2`} type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} />
          </label>
        </div>
        {act.distance && pace(num(duration), num(distance)) && (
          <p className="-mt-2 text-xs text-muted">Pace {pace(num(duration), num(distance))}</p>
        )}

        <label className="block">
          <span className={label}>Calories burned</span>
          <input
            className={input}
            inputMode="numeric"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            placeholder={estimate != null ? `About ${estimate} (estimated)` : "From your watch, or leave blank"}
          />
          <span className="mt-1 block text-xs text-muted">
            {kcal.trim()
              ? "Using your number."
              : estimate != null
                ? `Leave blank to use the estimate (${estimate} kcal from time, ${act.distance ? "pace, " : ""}and body weight).`
                : latestWeightLb == null
                  ? "Log a weigh-in so blank calories can be estimated."
                  : "Add the time to get an estimate."}
          </span>
        </label>
      </section>

      {act.sets && (
        <>
          <datalist id="lift-names">
            {names.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {blocks.map((b, bi) => {
            const v = volume(b.sets.map((s) => ({ exercise: b.exercise, weight_lb: num(s.weight), reps: Number(s.reps) || 0 })));
            const last = lastTime[liftKey(b.exercise)];
            return (
              <section key={b.key} className={`${card} space-y-2`}>
                <div className="flex items-center gap-2">
                  <input
                    className={`${input} font-medium`}
                    list="lift-names"
                    value={b.exercise}
                    onChange={(e) => setBlock(b.key, { exercise: e.target.value })}
                    placeholder={`Exercise ${bi + 1}, e.g. Bench press`}
                    aria-label="Exercise"
                  />
                  <button
                    type="button"
                    className="px-2 text-muted"
                    aria-label="Remove exercise"
                    onClick={() => setBlocks((bs) => bs.filter((x) => x.key !== b.key))}
                  >
                    ×
                  </button>
                </div>
                {last && <p className="text-xs text-muted">Last time: {last}</p>}
                <div className="grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-2 text-xs text-muted">
                  <span>Set</span>
                  <span>Weight (lb)</span>
                  <span>Reps</span>
                  <span />
                </div>
                {b.sets.map((s, si) => (
                  <div key={s.key} className="grid grid-cols-[2rem_1fr_1fr_2rem] items-center gap-2">
                    <span className="text-center text-sm text-muted">{si + 1}</span>
                    <input
                      className={`${input} py-1.5`}
                      inputMode="decimal"
                      value={s.weight}
                      onChange={(e) => setSet(b.key, s.key, { weight: e.target.value })}
                      placeholder="BW"
                      aria-label={`Set ${si + 1} weight`}
                    />
                    <input
                      className={`${input} py-1.5`}
                      inputMode="numeric"
                      value={s.reps}
                      onChange={(e) => setSet(b.key, s.key, { reps: e.target.value })}
                      aria-label={`Set ${si + 1} reps`}
                    />
                    <button
                      type="button"
                      className="text-muted"
                      aria-label={`Remove set ${si + 1}`}
                      onClick={() => setBlock(b.key, { sets: b.sets.filter((x) => x.key !== s.key) })}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between pt-1">
                  <button type="button" className="text-sm font-medium text-accent" onClick={() => addSet(b.key)}>
                    + Add set
                  </button>
                  <span className="text-xs text-muted">
                    Volume <span className="text-foreground">{v.toLocaleString()} lb</span>
                  </span>
                </div>
              </section>
            );
          })}
          <button
            type="button"
            className={`${buttonGhost} w-full`}
            onClick={() => setBlocks((bs) => [...bs, { key: k(), exercise: "", sets: [{ key: k(), weight: "", reps: "" }] }])}
          >
            + Add exercise
          </button>
        </>
      )}

      <section className={`${card} space-y-3`}>
        <label className="block">
          <span className={label}>Note</span>
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" maxLength={1000} />
        </label>
        {act.sets && (
          <p className="text-sm">
            Total volume <span className="font-semibold">{totalVolume.toLocaleString()} lb</span>
            <span className="text-muted">
              {" "}
              · {flatSets.filter((s) => s.reps > 0).length} sets · {flatSets.reduce((a, s) => a + s.reps, 0)} reps
            </span>
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="button" className={`${button} w-full`} disabled={saving} onClick={submit}>
          {saving ? "Saving…" : draft.id ? "Save changes" : "Save workout"}
        </button>
      </section>
    </div>
  );
}
