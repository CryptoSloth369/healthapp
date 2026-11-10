"use client";

import { useState, useTransition } from "react";
import { applyCalorieTarget, saveProposedTemplate } from "./actions";
import { activityLabel } from "@/lib/exercise";
import type { Proposal } from "@/lib/assistant/display";

/** A change the coach suggested. Nothing happens until the user taps the button. */
export function ProposalCard({ p }: { p: Proposal }) {
  const [state, setState] = useState<"idle" | "done" | string>("idle");
  const [pending, start] = useTransition();
  const i = p.input as Record<string, unknown>;

  let title = "";
  let body: React.ReactNode = null;
  let button = "";
  let run: () => Promise<{ error?: string }>;

  if (p.name === "propose_calorie_target") {
    title = `Daily target: ${Number(i.kcal).toLocaleString()} kcal`;
    body = <p className="text-sm text-muted">{String(i.reason ?? "")}</p>;
    button = "Apply target";
    run = () => applyCalorieTarget(Number(i.kcal));
  } else if (p.name === "propose_workout_template") {
    const ex = (i.exercises as { exercise: string; sets: number; reps?: number; weight_lb?: number }[]) ?? [];
    title = `Template: ${String(i.name)}`;
    body = (
      <div className="text-sm">
        <p className="text-muted">
          {activityLabel(String(i.activity))}
          {i.duration_min != null && ` · ${i.duration_min} min`}
        </p>
        {ex.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {ex.map((e, k) => (
              <li key={k} className="flex justify-between gap-3">
                <span className="truncate">{e.exercise}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {e.sets}×{e.reps ?? "?"}
                  {e.weight_lb != null && ` @ ${e.weight_lb} lb`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
    button = "Save template";
    run = () =>
      saveProposedTemplate({
        name: String(i.name),
        activity: String(i.activity),
        duration_min: i.duration_min as number | undefined,
        exercises: ex,
      });
  } else return null;

  return (
    <div className="space-y-2 rounded-xl border border-accent/50 bg-background p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">Suggestion</p>
      <p className="font-semibold">{title}</p>
      {body}
      {state === "done" ? (
        <p className="text-sm text-accent">✓ Done</p>
      ) : (
        <button
          type="button"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-fg disabled:opacity-50"
          onClick={() =>
            start(async () => {
              const r = await run();
              setState(r.error ? r.error : "done");
            })
          }
        >
          {pending ? "Saving…" : button}
        </button>
      )}
      {state !== "idle" && state !== "done" && <p className="text-sm text-danger">{state}</p>}
    </div>
  );
}
