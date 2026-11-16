"use client";

import { useState, useTransition } from "react";
import { recalculateEnergyAction } from "./actions";

/** Reruns the energy model over all history. Render inside a wrapping flex row. */
export function RecalculateButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recalculateEnergyAction();
            setError(r.error ?? null);
          })
        }
        className="shrink-0 rounded-lg border border-border px-2.5 py-1 text-xs text-accent disabled:text-muted"
      >
        {pending ? "Calculating…" : "Recalculate"}
      </button>
      {/* Full width on its own line (the parent row wraps), so long errors don't squeeze the heading. */}
      {error && (
        <p role="alert" className="basis-full break-words text-xs text-danger">
          {error}
        </p>
      )}
    </>
  );
}
