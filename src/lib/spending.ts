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

export function effectiveCategory(t: Txn, rules: Rule[]): string {
  if (t.category_override) return t.category_override;
  const hay = `${t.merchant_name ?? ""} ${t.name}`.toLowerCase();
  // Longest match wins, so "amazon prime" beats "amazon".
  const rule = rules.filter((r) => hay.includes(r.match)).sort((a, b) => b.match.length - a.match.length)[0];
  return rule?.category ?? categoryFromPlaid(t.pfc_primary, t.pfc_detailed);
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
