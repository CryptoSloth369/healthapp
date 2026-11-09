"use client";

import { useActionState, useEffect } from "react";
import { saveWeight, type WeightFormState } from "@/app/(app)/weight/actions";
import { button, input } from "./ui";

export type WeightDraft = { day: string; weight: string; note: string };

/**
 * Weigh-in form. `compact` hides the date and note (Today screen quick entry).
 * Pass `draft` to edit an existing entry. Inputs are uncontrolled: the parent
 * resets the form by changing its `key` (e.g. in `onSaved`).
 */
export function WeightForm({
  today,
  draft,
  compact = false,
  onSaved,
}: {
  today: string;
  draft?: WeightDraft | null;
  compact?: boolean;
  onSaved?: () => void;
}) {
  const [state, action, pending] = useActionState<WeightFormState, FormData>(saveWeight, {});

  useEffect(() => {
    if (state.savedAt) onSaved?.();
    // Only when a new save completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.savedAt]);

  return (
    <form action={action} className="space-y-3">
      <div className="flex gap-2">
        {compact ? (
          <input type="hidden" name="measured_on" value={today} />
        ) : (
          <input
            className={`${input} w-auto flex-1`}
            type="date"
            name="measured_on"
            defaultValue={draft?.day ?? today}
            max={today}
            aria-label="Date"
            required
          />
        )}
        <div className="relative flex-1">
          <input
            className={`${input} pr-9`}
            name="weight_lb"
            inputMode="decimal"
            placeholder="Weight"
            defaultValue={draft?.weight ?? ""}
            aria-label="Weight in pounds"
            required
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">lb</span>
        </div>
        {compact && (
          <button className={button} disabled={pending}>
            {pending ? "…" : "Save"}
          </button>
        )}
      </div>
      {!compact && (
        <>
          <input className={input} name="note" placeholder="Note (optional)" defaultValue={draft?.note ?? ""} aria-label="Note" />
          <button className={`${button} w-full`} disabled={pending}>
            {pending ? "Saving…" : draft ? "Update weigh-in" : "Save weigh-in"}
          </button>
        </>
      )}
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}
