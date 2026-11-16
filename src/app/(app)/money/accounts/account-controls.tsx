"use client";

import { useActionState, useState, useTransition } from "react";
import { addManualAccount, deleteManualAccount, disconnect, updateAccount } from "../actions";
import { KIND_LABELS, MANUAL_KINDS, parseMoney, type AccountKind } from "@/lib/finance";
import { button, buttonGhost, input, label } from "@/components/ui";

type Editable = { id: string; name: string; display_name: string | null; kind: AccountKind; balance: number; shared: boolean; hidden: boolean; is_manual: boolean };

/** Settings for one of your own accounts. Toggles save immediately. */
export function AccountEditor({ a }: { a: Editable }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => setError((await fn()).error ?? null));

  return (
    <div className="space-y-3 pt-2">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = String(new FormData(e.currentTarget).get("display_name") ?? "").trim();
          run(() => updateAccount(a.id, { display_name: v || null }));
        }}
      >
        <input className={input} name="display_name" defaultValue={a.display_name ?? ""} placeholder={a.name} maxLength={80} aria-label="Name shown in the app" />
        <button className={buttonGhost} disabled={pending}>
          Rename
        </button>
      </form>

      {a.is_manual && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parseMoney(String(new FormData(e.currentTarget).get("balance") ?? ""));
            if (v == null) return setError("Enter dollars, like 25000 or 1,250.50.");
            run(() => updateAccount(a.id, { balance: v }));
          }}
        >
          <input className={input} name="balance" inputMode="decimal" defaultValue={a.balance.toFixed(2)} aria-label="Current value in dollars" />
          <button className={buttonGhost} disabled={pending}>
            Update value
          </button>
        </form>
      )}

      <label className="block space-y-1 text-sm">
        <span className="block">
          Type
          <span className="block text-xs text-muted">Change it if the bank&apos;s label is wrong.</span>
        </span>
        <select
          className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          defaultValue={a.kind}
          disabled={pending}
          onChange={(e) => run(() => updateAccount(a.id, { kind: e.target.value as AccountKind }))}
        >
          {MANUAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <Toggle label="Share with family" hint="Family members see this account and its balance." checked={a.shared} disabled={pending} onChange={(v) => run(() => updateAccount(a.id, { shared: v }))} />
      <Toggle label="Leave out of totals" hint="Still listed here, but not counted." checked={a.hidden} disabled={pending} onChange={(v) => run(() => updateAccount(a.id, { hidden: v }))} />

      {a.is_manual && (
        <button
          type="button"
          className="text-sm text-danger"
          disabled={pending}
          onClick={() => window.confirm(`Delete "${a.display_name ?? a.name}" and its history?`) && run(() => deleteManualAccount(a.id))}
        >
          Delete account
        </button>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function Toggle({ label: text, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span>
        {text}
        <span className="block text-xs text-muted">{hint}</span>
      </span>
      <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" defaultChecked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function DisconnectButton({ itemId, name }: { itemId: string; name: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className="text-sm text-danger disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Disconnect ${name}? Its accounts and their history are removed from the app, and Plaid stops billing for it.`)) return;
          start(async () => {
            const r = await disconnect(itemId);
            setNote(r.error ?? r.warning ?? null);
          });
        }}
      >
        {pending ? "Removing…" : "Disconnect"}
      </button>
      {note && <span className="text-xs text-danger">{note}</span>}
    </span>
  );
}

export function ManualAccountForm() {
  const [state, action, pending] = useActionState(addManualAccount, {});
  return (
    <form key={state.savedAt} action={action} className="space-y-3">
      <div>
        <label className={label} htmlFor="m-name">Name</label>
        <input className={input} id="m-name" name="name" placeholder="Home, Car, Cash at home…" maxLength={80} required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} htmlFor="m-kind">Type</label>
          <select className={input} id="m-kind" name="kind" defaultValue="other_asset">
            {MANUAL_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="m-balance">Value ($)</label>
          <input className={input} id="m-balance" name="balance" inputMode="decimal" placeholder="25000" required />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="shared" defaultChecked className="h-4 w-4 accent-[var(--accent)]" /> Share with family
      </label>
      {state.error && <p className="text-sm text-danger">{state.error}</p>}
      <button className={`${button} w-full`} disabled={pending}>
        {pending ? "Adding…" : "Add account"}
      </button>
    </form>
  );
}
