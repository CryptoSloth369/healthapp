import Link from "next/link";
import { card } from "@/components/ui";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/finance";
import type { AccountView } from "@/lib/money-data";
import type { RuleRow } from "@/lib/spending-data";
import {
  categoryLabel,
  donutSlices,
  effectiveCategory,
  merchantKey,
  monthRange,
  NOT_SPENDING,
  shiftMonth,
  spendingByCategory,
  type Txn,
} from "@/lib/spending";
import { SpendingDonut } from "@/components/spending-donut";
import { sliceColor, type Slice } from "@/components/slice-color";
import { AccountFilter, CategoryEditor, DeleteRule } from "./spending-controls";

/** Spending page, rendered from loaded data (also used for previews). */
export function SpendingView({
  month,
  today,
  filter,
  cat,
  accounts,
  txns,
  rules,
}: {
  month: string;
  today: string;
  filter: string;
  cat: string | null;
  accounts: AccountView[];
  txns: Txn[];
  rules: RuleRow[];
}) {
  const { start, end } = monthRange(month);
  const prevMonth = shiftMonth(month, -1);
  const current = today.slice(0, 7) === month;
  const prev = monthRange(prevMonth);
  // This month so far vs the same days of last month; past months compare in full.
  const prevEnd = current ? `${prevMonth}-${String(Math.min(Number(today.slice(8)), Number(prev.end.slice(8)))).padStart(2, "0")}` : prev.end;
  const cur = txns.filter((t) => t.day >= start && t.day <= end);
  const before = txns.filter((t) => t.day >= prev.start && t.day <= prevEnd);
  const now = spendingByCategory(cur, rules);
  const was = spendingByCategory(before, rules);
  const slices: Slice[] = donutSlices(now.categories).map((c) => ({ key: c.category, label: c.label, total: c.total, count: c.count }));
  const restIds = new Set(now.categories.slice(slices.length - 1).map((c) => c.category));
  const excluded = cur.filter((t) => NOT_SPENDING.has(effectiveCategory(t, rules)));
  const selected =
    cat == null
      ? []
      : cur.filter((t) => {
          const c = effectiveCategory(t, rules);
          return cat === "_rest" ? restIds.has(c) && slices.at(-1)?.key === "_rest" : c === cat;
        });
  const accountName = new Map(accounts.map((a) => [a.id, `${a.display_name ?? a.name}${a.mask ? ` ••${a.mask}` : ""}`]));
  const q = (m: string, c?: string) => `/money/spending?month=${m}&acct=${encodeURIComponent(filter)}${c ? `&cat=${encodeURIComponent(c)}` : ""}`;
  const cards = accounts.filter((a) => a.kind === "credit");
  const options = [
    { value: "cards", label: `All credit cards (${cards.length})` },
    { value: "all", label: "Cards and bank accounts" },
    ...accounts.map((a) => ({ value: a.id, label: accountName.get(a.id)! })),
  ];
  const diff = now.total - was.total;

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Spending</h1>
          <nav className="flex items-center gap-1 text-sm" aria-label="Month">
            <Link href={q(prevMonth)} className="rounded-md px-2 py-1 text-accent" aria-label="Previous month">
              ‹
            </Link>
            <span className="min-w-28 text-center font-medium">{formatDay(start, { month: "long", year: "numeric" })}</span>
            {current ? (
              <span className="px-2 py-1 text-muted opacity-40" aria-hidden>
                ›
              </span>
            ) : (
              <Link href={q(shiftMonth(month, 1))} className="rounded-md px-2 py-1 text-accent" aria-label="Next month">
                ›
              </Link>
            )}
          </nav>
        </div>
        <AccountFilter value={filter} options={options} month={month} />
      </header>

      {accounts.length === 0 ? (
        <section className={`${card} space-y-2`}>
          <p className="text-sm text-muted">Connect a credit card or bank account to see where your money goes.</p>
          <Link href="/money/accounts" className="text-sm text-accent">
            Connect an account →
          </Link>
        </section>
      ) : (
        <section className={`${card} space-y-3`}>
          {now.total === 0 ? (
            <p className="py-6 text-center text-sm text-muted">
              No spending {current ? "this month yet" : "this month"}. New connections can take a few minutes to bring in transactions; tap Sync on
              Overview.
            </p>
          ) : (
            <>
              <SpendingDonut slices={slices} total={now.total} />
              {was.total > 0 && (
                <p className="text-center text-sm text-muted tabular-nums">
                  {diff >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(diff))} vs {current ? "this point in " : ""}
                  {formatDay(prev.start, { month: "long" })}
                </p>
              )}
              <ul className="divide-y divide-border">
                {slices.map((s, i) => (
                  <li key={s.key}>
                    <Link href={q(month, s.key)} className={`flex items-center gap-3 py-2 ${cat === s.key ? "font-semibold" : ""}`}>
                      <svg width="12" height="12" aria-hidden className="shrink-0">
                        <rect width="12" height="12" rx="3" fill={sliceColor(s, i)} />
                      </svg>
                      <span className="min-w-0 flex-1 truncate">{s.key === "_rest" ? `Other categories (${s.label})` : s.label}</span>
                      <span className="text-xs text-muted tabular-nums">{Math.round((s.total / now.total) * 100)}%</span>
                      <span className="w-20 text-right tabular-nums">{formatMoney(s.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {excluded.length > 0 && (
            <p className="text-xs text-muted">
              Left out: {excluded.length} card payment{excluded.length === 1 ? "" : "s"}, transfer{excluded.length === 1 ? "" : "s"} or income.{" "}
              <Link href={q(month, "transfer")} className="text-accent">
                Review
              </Link>
            </p>
          )}
        </section>
      )}

      {cat && (
        <section className={`${card} space-y-1`}>
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{cat === "_rest" ? "Other categories" : categoryLabel(cat)}</h2>
            <Link href={q(month)} className="text-sm text-accent">
              Close
            </Link>
          </div>
          {selected.length === 0 && <p className="text-sm text-muted">Nothing here this month.</p>}
          <ul className="divide-y divide-border">
            {selected.map((t) => {
              const c = effectiveCategory(t, rules);
              return (
                <li key={t.id}>
                  <details className="py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate">{t.merchant_name || t.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {[
                            formatDay(t.day, { month: "short", day: "numeric" }),
                            accountName.get(t.account_id),
                            t.pending && "Pending",
                            cat === "_rest" || NOT_SPENDING.has(cat) ? categoryLabel(c) : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {t.amount < 0 ? "+" : ""}
                        {formatMoney(Math.abs(t.amount), { cents: true })}
                      </span>
                    </summary>
                    <CategoryEditor id={t.id} current={c} auto={!t.category_override} merchant={merchantKey(t)} />
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {rules.length > 0 && (
        <section className={`${card} space-y-1`}>
          <h2 className="font-semibold">Your category rules</h2>
          <ul className="divide-y divide-border text-sm">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0 truncate">
                  &ldquo;{r.match}&rdquo; → {categoryLabel(r.category)}
                </span>
                <DeleteRule id={r.id} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Shared with your family. They apply to past and future transactions.</p>
        </section>
      )}
    </div>
  );
}
