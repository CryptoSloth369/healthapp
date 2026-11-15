"use client";

import { useState, useTransition } from "react";
import { recalculateEnergyAction } from "./actions";

/** Reruns the energy model over all history. */
export function RecalculateButton() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recalculateEnergyAction();
            setError(r.error ?? null);
          })
        }
        className="rounded-lg border border-border px-2.5 py-1 text-xs text-accent disabled:text-muted"
      >
        {pending ? "Calculating…" : "Recalculate"}
      </button>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
