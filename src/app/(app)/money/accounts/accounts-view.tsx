import { card } from "@/components/ui";
import { formatMoney, isDebt, KIND_LABELS, type AccountKind } from "@/lib/finance";
import type { AccountView, ItemView } from "@/lib/money-data";
import { ConnectButtons, ReconnectButton } from "@/components/plaid-link";
import { ago } from "../overview-view";
import { AccountEditor, DisconnectButton, ManualAccountForm } from "./account-controls";

const PRODUCT_LABELS: Record<string, string> = { transactions: "Bank & cards", investments: "Investments", liabilities: "Loans" };

/** Accounts page, rendered from loaded data (also used for previews). */
export function AccountsView({ accounts, items, now }: { accounts: AccountView[]; items: ItemView[]; now: string }) {
  const institution = new Map(items.map((i) => [i.id, i.institution_name]));
  const groups = (Object.keys(KIND_LABELS) as AccountKind[])
    .map((k) => ({ kind: k, list: accounts.filter((a) => a.kind === k) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Accounts</h1>

      <section className={`${card} space-y-3`}>
        <div>
          <h2 className="font-semibold">Connect an account</h2>
          <p className="text-sm text-muted">Read-only through Plaid; nothing can move money. Pick what you&apos;re connecting so only the data you need is requested.</p>
        </div>
        <ConnectButtons />
      </section>

      {groups.map((g) => (
        <section key={g.kind} className={`${card} space-y-1`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{KIND_LABELS[g.kind]}</h2>
            <span className="text-sm text-muted tabular-nums">
              {isDebt(g.kind) ? "−" : ""}
              {formatMoney(g.list.filter((a) => !a.hidden).reduce((s, a) => s + a.balance, 0))}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {g.list.map((a) => (
              <li key={a.id}>
                <details className="group py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className={`block truncate ${a.hidden ? "text-muted line-through" : ""}`}>{a.display_name ?? a.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[
                          a.is_manual ? "Added by hand" : (a.item_id && institution.get(a.item_id)) || "Connected",
                          a.mask && `••${a.mask}`,
                          !a.mine && `${a.ownerName ?? "Family"}'s`,
                          a.mine && !a.shared && "Private",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right tabular-nums">
                      {isDebt(a.kind) && a.balance > 0 ? "−" : ""}
                      {formatMoney(Math.abs(a.balance), { cents: true })}
                      {a.credit_limit != null && a.kind === "credit" && (
                        <span className="block text-xs text-muted">of {formatMoney(a.credit_limit)} limit</span>
                      )}
                    </span>
                  </summary>
                  {a.mine ? (
                    <AccountEditor a={a} />
                  ) : (
                    <p className="pt-2 text-sm text-muted">Shared by {a.ownerName ?? "a family member"}; only they can change it.</p>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {items.length > 0 && (
        <section className={`${card} space-y-1`}>
          <h2 className="font-semibold">Connections</h2>
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{i.institution_name ?? "Bank"}</span>
                  <span className="block text-xs text-muted">
                    {i.products.map((p) => PRODUCT_LABELS[p] ?? p).join(", ")} ·{" "}
                    {i.status === "ok"
                      ? i.last_synced_at
                        ? `synced ${ago(i.last_synced_at, now)}`
                        : "not synced yet"
                      : i.status === "login_required"
                        ? "needs sign-in"
                        : "sync error"}
                  </span>
                </span>
                {i.mine ? (
                  <span className="flex shrink-0 items-center gap-3">
                    {i.status !== "ok" && <ReconnectButton itemId={i.id} />}
                    <DisconnectButton itemId={i.id} name={i.institution_name ?? "this bank"} />
                  </span>
                ) : (
                  <span className="text-xs text-muted">Family&apos;s</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="manual" className={`${card} space-y-3`}>
        <div>
          <h2 className="font-semibold">Add an account by hand</h2>
          <p className="text-sm text-muted">For things Plaid can&apos;t see: your home, a car, cash, a private loan. Update the value whenever you like.</p>
        </div>
        <ManualAccountForm />
      </section>
    </div>
  );
}
