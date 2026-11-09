"use client";

import { useState, useTransition } from "react";
import { setCalorieOverride } from "./actions";

export function ApplyTargetButton({ kcal, current }: { kcal: number; current: number | null }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  if (current === kcal) return <p className="text-xs text-accent">This is your current target.</p>;
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        className="rounded-xl border border-accent px-3 py-2 text-sm font-medium text-accent disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await setCalorieOverride(kcal);
            setMsg(r.error ?? "Target updated.");
          })
        }
      >
        {pending ? "Saving…" : `Use ${kcal.toLocaleString()} kcal as my target`}
      </button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
