"use client";

import { useActionState, useState } from "react";
import { changePassword, type PasswordState } from "@/app/login/actions";
import { buttonGhost, card, input } from "@/components/ui";

export function PasswordForm() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});

  if (!open) {
    return (
      <div className="space-y-2">
        {state.saved && <p className="text-center text-sm text-accent">Password changed.</p>}
        <button type="button" className={`${buttonGhost} w-full`} onClick={() => setOpen(true)}>
          Change password
        </button>
      </div>
    );
  }

  return (
    <form
      action={action}
      className={`${card} space-y-3`}
    >
      <p className="font-semibold">Change password</p>
      {/* Hidden username helps iOS Keychain save the new password to the right account. */}
      <input type="text" name="username" autoComplete="username" className="hidden" readOnly />
      <input className={input} type="password" name="password" autoComplete="new-password" placeholder="New password" required minLength={8} />
      <input className={input} type="password" name="confirm" autoComplete="new-password" placeholder="Confirm new password" required minLength={8} />
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      {state.saved && <p className="text-sm text-accent">Password changed.</p>}
      <div className="flex gap-2">
        <button type="button" className={`${buttonGhost} flex-1`} onClick={() => setOpen(false)}>
          Close
        </button>
        <button className={`${buttonGhost} flex-1 border-accent text-accent`} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
