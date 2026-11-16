"use client";

import { useActionState, useState, useTransition } from "react";
import { createInvite, leaveFamily, removeMember, renameFamily, revokeInvite } from "./actions";
import { button, buttonGhost, input } from "@/components/ui";

/** Creates an invite link and offers Share (iPhone share sheet) or Copy. */
export function InviteCreator() {
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const share = async (u: string) => {
    try {
      if (navigator.share) await navigator.share({ title: "Join our family's money", url: u });
      else {
        await navigator.clipboard.writeText(u);
        setNote("Copied.");
      }
    } catch {
      // Share sheet dismissed.
    }
  };

  return (
    <div className="space-y-2">
      {!url ? (
        <button
          type="button"
          className={`${button} w-full`}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createInvite();
              if (r.url) setUrl(r.url);
              else setNote(r.error ?? "Couldn't create the link.");
            })
          }
        >
          {pending ? "Creating…" : "Create invite link"}
        </button>
      ) : (
        <>
          <p className="break-all rounded-xl border border-border bg-background px-3 py-2 text-xs">{url}</p>
          <div className="flex gap-2">
            <button type="button" className={`${button} flex-1`} onClick={() => share(url)}>
              Share
            </button>
            <button
              type="button"
              className={`${buttonGhost} flex-1`}
              onClick={() => navigator.clipboard.writeText(url).then(() => setNote("Copied."))}
            >
              Copy
            </button>
          </div>
          <p className="text-xs text-muted">Works once and expires in 7 days. This is the only time it&apos;s shown.</p>
        </>
      )}
      {note && <p className="text-xs text-muted">{note}</p>}
    </div>
  );
}

export function RenameFamily({ name }: { name: string }) {
  const [state, action, pending] = useActionState(renameFamily, {});
  return (
    <form action={action} className="flex gap-2">
      <input className={input} name="name" defaultValue={name} maxLength={60} aria-label="Family name" required />
      <button className={buttonGhost} disabled={pending}>
        Save
      </button>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
    </form>
  );
}

/** A small button that asks first, runs an action, and shows its error. */
export function ConfirmButton({
  label,
  confirm,
  run,
  danger,
}: {
  label: string;
  confirm: string;
  run: () => Promise<{ error?: string }>;
  danger?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        disabled={pending}
        className={`text-sm ${danger ? "text-danger" : "text-accent"} disabled:opacity-50`}
        onClick={() => {
          if (!window.confirm(confirm)) return;
          start(async () => setError((await run()).error ?? null));
        }}
      >
        {pending ? "…" : label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}

export function RevokeInvite({ id }: { id: string }) {
  return <ConfirmButton label="Cancel" confirm="Cancel this invite link?" run={() => revokeInvite(id)} />;
}

export function RemoveMember({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmButton
      label="Remove"
      danger
      confirm={`Remove ${name} from the family? Their own accounts go with them, and they stop seeing shared money.`}
      run={() => removeMember(id)}
    />
  );
}

export function LeaveFamily() {
  return (
    <ConfirmButton
      label="Leave family"
      danger
      confirm="Leave this family? Your own accounts come with you, and you stop seeing everyone else's shared money."
      run={leaveFamily}
    />
  );
}
