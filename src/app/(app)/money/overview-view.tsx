import Link from "next/link";
import { card } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { formatMoney, KIND_LABELS, netWorthSeries, totals, type AccountKind, type BalancePoint } from "@/lib/finance";
import type { AccountView, ItemView } from "@/lib/money-data";
import { NetWorthChart } from "@/components/net-worth-chart";
import { ConnectButtons, ReconnectButton } from "@/components/plaid-link";
import { SyncButton } from "./money-bits";
import { CoachLink } from "@/components/coach-link";

/** Money overview, rendered from loaded data (also used for previews). */
export function OverviewView({
  accounts,
  items,
  history,
  syncError,
  now,
}: {
  accounts: AccountView[];
  items: ItemView[];
  history: BalancePoint[];
  syncError: string | null;
  now: string;
}) {
  const t = totals(accounts.map((a) => ({ ...a, subtype: a.plaid_subtype })));
  const series = netWorthSeries(history, accounts);
  const first = series[0];
  const change = first && series.length > 1 ? t.netWorth - first.netWorth : null;
  const lastSync = items.map((i) => i.last_synced_at).filter((x): x is string => !!x).sort().at(-1);
  const problems = items.filter((i) => i.status !== "ok");
  const shared = accounts.filter((a) => !a.mine).length;
  const hidden = accounts.filter((a) => a.hidden).length;

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Money</h1>
          <p className="text-xs text-muted">{lastSync ? `Synced ${ago(lastSync, now)}` : items.length ? "Not synced yet" : "Nothing connected yet"}</p>
        </div>
        <div className="flex items-start gap-2">
          {items.length > 0 && <SyncButton />}
          {accounts.length > 0 && <CoachLink small />}
        </div>
      </header>

      {syncError && (
        <p role="alert" className="rounded-xl border border-danger/40 px-3 py-2 text-xs text-danger">
          Couldn&apos;t refresh: {syncError}
        </p>
      )}
      {problems.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-warn/50 px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{i.institution_name ?? "A bank"}</span>{" "}
            {i.status === "login_required" ? "needs you to sign in again." : `couldn't sync: ${i.error ?? "unknown error"}`}
          </span>
          {i.mine ? <ReconnectButton itemId={i.id} /> : <span className="text-xs text-muted">The person who connected it can fix this.</span>}
        </div>
      ))}

      {accounts.length === 0 ? (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Connect your first account</h2>
          <p className="text-sm text-muted">
            Read-only through Plaid: the app can see balances and transactions but can never move money. You can also{" "}
            <Link href="/money/accounts#manual" className="text-accent">
              add accounts by hand
            </Link>{" "}
            (home, car, cash).
          </p>
          <ConnectButtons />
        </section>
      ) : (
        <>
          <section className={`${card} space-y-2`}>
            <p className="text-xs text-muted">Net worth</p>
            <p className="text-4xl font-semibold tabular-nums">{formatMoney(t.netWorth)}</p>
            {change != null && (
              <p className="text-sm text-muted tabular-nums">
                {change >= 0 ? "+" : "−"}
                {formatMoney(Math.abs(change))} since {formatDay(first.day, { month: "short", day: "numeric" })}
              </p>
            )}
            {series.length > 0 && <NetWorthChart points={series} />}
            {series.length < 2 && <p className="text-xs text-muted">The chart fills in as balances are recorded each day.</p>}
          </section>

          <section className="grid grid-cols-2 gap-3">
            {(["cash", "investment", "retirement", "other_asset"] as AccountKind[])
              .filter((k) => k !== "other_asset" || t.byKind.other_asset !== 0)
              .map((k) => (
                <Tile key={k} label={KIND_LABELS[k]} value={formatMoney(t.byKind[k])} sub={countOf(accounts, k)} />
              ))}
          </section>

          <section className={`${card} space-y-2`}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">Debt</h2>
              <span className="text-xl font-semibold tabular-nums">{formatMoney(t.debts)}</span>
            </div>
            {t.debtGroups.length === 0 ? (
              <p className="text-sm text-muted">No debt in your accounts.</p>
            ) : (
              <ul className="divide-y divide-border text-sm">
                {t.debtGroups.map((g) => (
                  <li key={g.label} className="flex justify-between py-1.5">
                    <span>{g.label}</span>
                    <span className="tabular-nums">{formatMoney(g.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-xs text-muted">
            Assets {formatMoney(t.assets)} − debt {formatMoney(t.debts)}.{" "}
            {shared > 0 && `Includes ${shared} account${shared === 1 ? "" : "s"} shared by family. `}
            {hidden > 0 && `${hidden} hidden account${hidden === 1 ? " is" : "s are"} left out. `}
            <Link href="/money/accounts" className="text-accent">
              Manage accounts →
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function countOf(accounts: AccountView[], kind: AccountKind) {
  const n = accounts.filter((a) => a.kind === kind && !a.hidden).length;
  return n === 0 ? "None yet" : `${n} account${n === 1 ? "" : "s"}`;
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className={card}>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted">{sub}</p>
    </div>
  );
}

/** "just now", "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string, now: string) {
  const min = Math.max(0, Math.round((Date.parse(now) - Date.parse(iso)) / 60_000));
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} days ago`;
}
