"use client";

import { useState, useTransition } from "react";
import { syncNow } from "./actions";

/** Refresh all connections now. */
export function SyncButton() {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  return (
    <div className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncNow();
            setNote(r.error ? { text: r.error, bad: true } : r.warning ? { text: r.warning, bad: true } : null);
          })
        }
        className="rounded-lg border border-border px-2.5 py-1 text-xs text-accent disabled:text-muted"
      >
        {pending ? "Syncing…" : "Sync"}
      </button>
      {note && <p className={`mt-1 max-w-56 text-right text-xs ${note.bad ? "text-danger" : "text-muted"}`}>{note.text}</p>}
    </div>
  );
}
