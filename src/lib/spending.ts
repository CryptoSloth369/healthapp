/**
 * Spending categories and totals. Pure functions, no I/O.
 *
 * A transaction's category: a person's override, else the first family rule
 * whose text appears in the merchant or name, else Plaid's category mapped to
 * ours. Transfers (including credit card payments) and income are not
 * spending. Amounts follow Plaid: positive = money out; refunds (negative)
 * reduce their category's total.
 */

export const CATEGORIES = [
  { id: "groceries", label: "Groceries" },
  { id: "dining", label: "Dining out" },
  { id: "shopping", label: "Shopping" },
  { id: "transportation", label: "Transportation" },
  { id: "travel", label: "Travel" },
  { id: "housing", label: "Rent & housing" },
  { id: "bills", label: "Bills & utilities" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "entertainment", label: "Entertainment" },
  { id: "health", label: "Health & medical" },
  { id: "personal_care", label: "Personal care" },
  { id: "home", label: "Home & garden" },
  { id: "services", label: "Services" },
  { id: "giving", label: "Gifts & donations" },
  { id: "government", label: "Taxes & government" },
  { id: "loan_payments", label: "Loan payments" },
  { id: "fees", label: "Fees & interest" },
  { id: "other", label: "Other" },
  // Not spending:
  { id: "income", label: "Income & refunds" },
  { id: "transfer", label: "Transfers & card payments" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const NOT_SPENDING: ReadonlySet<string> = new Set(["income", "transfer"]);
const LABELS = new Map<string, string>(CATEGORIES.map((c) => [c.id, c.label]));
export const categoryLabel = (id: string) => LABELS.get(id) ?? id;
export const isCategory = (id: string): id is CategoryId => LABELS.has(id);

// Plaid "personal_finance_category" detailed values we split out; the rest go by primary.
const DETAILED: Record<string, CategoryId> = {
  FOOD_AND_DRINK_GROCERIES: "groceries",
  RENT_AND_UTILITIES_RENT: "housing",
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: "transfer",
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: "housing",
  GENERAL_SERVICES_INSURANCE: "bills",
  ENTERTAINMENT_TV_AND_MOVIES: "subscriptions",
  ENTERTAINMENT_MUSIC_AND_AUDIO: "subscriptions",
  BANK_FEES_INTEREST_CHARGE: "fees",
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: "giving",
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: "giving",
  INCOME_WAGES: "income",
};
const PRIMARY: Record<string, CategoryId> = {
  INCOME: "income",
  TRANSFER_IN: "transfer",
  TRANSFER_OUT: "transfer",
  LOAN_PAYMENTS: "loan_payments",
  BANK_FEES: "fees",
  ENTERTAINMENT: "entertainment",
  FOOD_AND_DRINK: "dining",
  GENERAL_MERCHANDISE: "shopping",
  HOME_IMPROVEMENT: "home",
  MEDICAL: "health",
  PERSONAL_CARE: "personal_care",
  GENERAL_SERVICES: "services",
  GOVERNMENT_AND_NON_PROFIT: "government",
  TRANSPORTATION: "transportation",
  TRAVEL: "travel",
  RENT_AND_UTILITIES: "bills",
};

export function categoryFromPlaid(primary: string | null | undefined, detailed: string | null | undefined): CategoryId {
  return (detailed && DETAILED[detailed]) || (primary && PRIMARY[primary]) || "other";
}

export type Rule = { match: string; category: string };
export type Txn = {
  id: string;
  account_id: string;
  day: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  pfc_primary: string | null;
  pfc_detailed: string | null;
  category_override: string | null;
};

/** Text a rule is matched against and created from. */
export const merchantKey = (t: Pick<Txn, "merchant_name" | "name">) => (t.merchant_name || t.name).trim().toLowerCase();

/** Where a transaction's category came from: set by a person, a family rule, or the bank (Plaid). */
export type CategorySource = "person" | "rule" | "bank";

export function categoryWithSource(t: Txn, rules: Rule[]): { category: string; source: CategorySource; rule?: string } {
  if (t.category_override) return { category: t.category_override, source: "person" };
  const hay = `${t.merchant_name ?? ""} ${t.name}`.toLowerCase();
  // Longest match wins, so "amazon prime" beats "amazon".
  const rule = rules.filter((r) => hay.includes(r.match)).sort((a, b) => b.match.length - a.match.length)[0];
  if (rule) return { category: rule.category, source: "rule", rule: rule.match };
  return { category: categoryFromPlaid(t.pfc_primary, t.pfc_detailed), source: "bank" };
}

export function effectiveCategory(t: Txn, rules: Rule[]): string {
  return categoryWithSource(t, rules).category;
}

export type CategoryTotal = { category: string; label: string; total: number; count: number };

/** Spending by category, largest first; categories netting to ≤ 0 (all refunds) are left out. */
export function spendingByCategory(txns: Txn[], rules: Rule[]): { total: number; categories: CategoryTotal[] } {
  const by = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    const c = effectiveCategory(t, rules);
    if (NOT_SPENDING.has(c)) continue;
    const s = by.get(c) ?? { total: 0, count: 0 };
    s.total += t.amount;
    s.count++;
    by.set(c, s);
  }
  const categories = [...by]
    .map(([category, s]) => ({ category, label: categoryLabel(category), total: Math.round(s.total * 100) / 100, count: s.count }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
  return { total: Math.round(categories.reduce((a, c) => a + c.total, 0) * 100) / 100, categories };
}

/** "cards" (default), "all" (cards + bank accounts), or one account id. */
export type SpendingFilter = string;

/** Accounts that have spending: credit cards and cash (checking/savings). */
export const spendableAccounts = <A extends { kind: string }>(accounts: A[]) => accounts.filter((a) => a.kind === "credit" || a.kind === "cash");

/** A spending filter → the accounts it means (from the spendable ones). */
export function chooseAccounts<A extends { id: string; kind: string }>(spendable: A[], filter: SpendingFilter): A[] {
  return filter === "all" ? spendable : filter === "cards" ? spendable.filter((a) => a.kind === "credit") : spendable.filter((a) => a.id === filter);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Spending per calendar month ("YYYY-MM"), oldest first; months with no spending are left out. */
export function spendingByMonth(txns: Txn[], rules: Rule[]): { month: string; total: number; count: number }[] {
  const by = new Map<string, { total: number; count: number }>();
  for (const t of txns) {
    if (NOT_SPENDING.has(effectiveCategory(t, rules))) continue;
    const m = t.day.slice(0, 7);
    const s = by.get(m) ?? { total: 0, count: 0 };
    s.total += t.amount;
    s.count++;
    by.set(m, s);
  }
  return [...by].map(([month, s]) => ({ month, total: round2(s.total), count: s.count })).sort((a, b) => a.month.localeCompare(b.month));
}

export type MerchantTotal = { merchant: string; total: number; count: number; categories: string[] };

/**
 * Spending per merchant (merchant name, else the transaction name), largest
 * first, at most `limit`. Merchants netting to ≤ 0 are left out.
 */
export function spendingByMerchant(txns: Txn[], rules: Rule[], limit = 20): MerchantTotal[] {
  const by = new Map<string, { name: string; total: number; count: number; categories: Set<string> }>();
  for (const t of txns) {
    const c = effectiveCategory(t, rules);
    if (NOT_SPENDING.has(c)) continue;
    const key = merchantKey(t);
    const s = by.get(key) ?? { name: (t.merchant_name || t.name).trim(), total: 0, count: 0, categories: new Set<string>() };
    s.total += t.amount;
    s.count++;
    s.categories.add(categoryLabel(c));
    by.set(key, s);
  }
  return [...by.values()]
    .map((s) => ({ merchant: s.name, total: round2(s.total), count: s.count, categories: [...s.categories] }))
    .filter((m) => m.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

/** Totals of what isn't spending (income and refunds; transfers and card payments), as positive amounts in and out. */
export function notSpendingTotals(txns: Txn[], rules: Rule[]): Record<"income" | "transfer", { in: number; out: number; count: number }> {
  const out = { income: { in: 0, out: 0, count: 0 }, transfer: { in: 0, out: 0, count: 0 } };
  for (const t of txns) {
    const c = effectiveCategory(t, rules);
    if (c !== "income" && c !== "transfer") continue;
    if (t.amount < 0) out[c].in -= t.amount;
    else out[c].out += t.amount;
    out[c].count++;
  }
  for (const v of Object.values(out)) {
    v.in = round2(v.in);
    v.out = round2(v.out);
  }
  return out;
}

/** The donut: the largest `max − 1` categories, then everything else as "Other". */
export function donutSlices(categories: CategoryTotal[], max = 8): CategoryTotal[] {
  if (categories.length <= max) return categories;
  const head = categories.slice(0, max - 1);
  const rest = categories.slice(max - 1);
  return [
    ...head,
    {
      category: "_rest",
      label: `${rest.length} more`,
      total: Math.round(rest.reduce((a, c) => a + c.total, 0) * 100) / 100,
      count: rest.reduce((a, c) => a + c.count, 0),
    },
  ];
}

/** "2026-11" → first and last day. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
