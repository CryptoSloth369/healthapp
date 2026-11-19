/**
 * Money math. Pure functions, no I/O. Amounts are dollars (numbers).
 *
 * Account balances are stored positive both for what you have and for what
 * you owe; `kind` decides which side of the net worth they're on.
 */

export type AccountKind = "cash" | "investment" | "retirement" | "credit" | "loan" | "other_asset" | "other_liability";

export const KIND_LABELS: Record<AccountKind, string> = {
  cash: "Cash",
  investment: "Investments (liquid)",
  retirement: "Retirement & tax-advantaged",
  credit: "Credit cards",
  loan: "Loans",
  other_asset: "Other assets",
  other_liability: "Other debts",
};

export const ASSET_KINDS: AccountKind[] = ["cash", "investment", "retirement", "other_asset"];
export const DEBT_KINDS: AccountKind[] = ["credit", "loan", "other_liability"];
export const isDebt = (k: AccountKind) => DEBT_KINDS.includes(k);

/** Kinds offered when adding an account by hand. */
export const MANUAL_KINDS: AccountKind[] = ["cash", "investment", "retirement", "other_asset", "loan", "credit", "other_liability"];

// Investment subtypes you can't freely sell out of (retirement, education, health).
const RESTRICTED_INVESTMENT = new Set([
  "401a", "401k", "403b", "457b", "529", "education savings account", "health reimbursement arrangement", "hsa",
  "ira", "keogh", "lif", "life insurance", "lira", "lrif", "lrsp", "pension", "prif", "profit sharing plan", "qshr",
  "rdsp", "resp", "retirement", "rlif", "roth", "roth 401k", "rrif", "rrsp", "sarsep", "sep ira", "simple ira", "sipp",
  "stock plan", "tfsa", "thrift savings plan", "ugma", "utma", "variable annuity", "fixed annuity", "other annuity",
]);

/** Map Plaid's account type/subtype to our kind. */
export function kindFromPlaid(type: string, subtype: string | null | undefined): AccountKind {
  const sub = (subtype ?? "").toLowerCase();
  switch (type) {
    case "depository":
      return sub === "hsa" ? "retirement" : "cash";
    case "credit":
      return "credit";
    case "loan":
      return "loan";
    case "investment":
    case "brokerage":
      return RESTRICTED_INVESTMENT.has(sub) ? "retirement" : "investment";
    default:
      return "other_asset";
  }
}

/** Loan subtypes worth showing separately in the debt breakdown. */
export function debtGroup(kind: AccountKind, subtype: string | null | undefined): string {
  if (kind === "credit") return "Credit cards";
  if (kind === "other_liability") return "Other debts";
  const sub = (subtype ?? "").toLowerCase();
  if (sub === "student") return "Student loans";
  if (sub === "mortgage" || sub === "home equity") return "Mortgage & home equity";
  if (sub === "auto") return "Auto loans";
  return "Other loans";
}

export type MoneyAccount = {
  id: string;
  kind: AccountKind;
  subtype: string | null;
  balance: number;
  hidden: boolean;
};

export type Totals = {
  byKind: Record<AccountKind, number>;
  assets: number;
  debts: number;
  netWorth: number;
  /** Debt split for display, largest first. */
  debtGroups: { label: string; amount: number }[];
};

const cents = (n: number) => Math.round(n * 100) / 100;

export function totals(accounts: MoneyAccount[]): Totals {
  const byKind = Object.fromEntries((Object.keys(KIND_LABELS) as AccountKind[]).map((k) => [k, 0])) as Record<AccountKind, number>;
  const groups = new Map<string, number>();
  for (const a of accounts) {
    if (a.hidden) continue;
    byKind[a.kind] += a.balance;
    if (isDebt(a.kind)) {
      const g = debtGroup(a.kind, a.subtype);
      groups.set(g, (groups.get(g) ?? 0) + a.balance);
    }
  }
  for (const k of Object.keys(byKind) as AccountKind[]) byKind[k] = cents(byKind[k]);
  const assets = cents(ASSET_KINDS.reduce((s, k) => s + byKind[k], 0));
  const debts = cents(DEBT_KINDS.reduce((s, k) => s + byKind[k], 0));
  return {
    byKind,
    assets,
    debts,
    netWorth: cents(assets - debts),
    debtGroups: [...groups].map(([label, amount]) => ({ label, amount: cents(amount) })).filter((g) => g.amount !== 0).sort((a, b) => b.amount - a.amount),
  };
}

export type BalancePoint = { accountId: string; day: string; balance: number };
export type NetWorthPoint = { day: string; assets: number; debts: number; netWorth: number };

/**
 * Net worth per day from balance snapshots. Each account carries its last
 * known balance forward; an account counts only from its first snapshot.
 * Days are the distinct snapshot days, oldest first.
 */
export function netWorthSeries(points: BalancePoint[], accounts: Pick<MoneyAccount, "id" | "kind" | "hidden">[]): NetWorthPoint[] {
  const kindOf = new Map(accounts.filter((a) => !a.hidden).map((a) => [a.id, a.kind]));
  const days = [...new Set(points.map((p) => p.day))].sort();
  const byDay = new Map<string, BalancePoint[]>();
  for (const p of points) {
    if (!kindOf.has(p.accountId)) continue;
    const list = byDay.get(p.day);
    if (list) list.push(p);
    else byDay.set(p.day, [p]);
  }
  const last = new Map<string, number>();
  return days.map((day) => {
    for (const p of byDay.get(day) ?? []) last.set(p.accountId, p.balance);
    let assets = 0;
    let debts = 0;
    for (const [id, bal] of last) {
      if (isDebt(kindOf.get(id)!)) debts += bal;
      else assets += bal;
    }
    return { day, assets: cents(assets), debts: cents(debts), netWorth: cents(assets - debts) };
  });
}

/**
 * Thin a daily series to the last point of each ISO week ("week") or calendar
 * month ("month"); "day" keeps everything. The newest point is always kept.
 */
export function thinSeries<T extends { day: string }>(points: T[], step: "day" | "week" | "month"): T[] {
  if (step === "day") return points;
  const keyOf = (day: string) => {
    if (step === "month") return day.slice(0, 7);
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
    return d.toISOString().slice(0, 10);
  };
  const last = new Map<string, T>();
  for (const p of points) last.set(keyOf(p.day), p);
  return [...last.values()];
}

/** "$12,345" (whole dollars) or "$12,345.67" with cents. Negative as "−$1,234". */
export function formatMoney(n: number, opts: { cents?: boolean } = {}): string {
  const s = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
  return `${n < 0 ? "−" : ""}$${s}`;
}

/** Parse a typed amount like "$1,234.50" or "1234.5"; null if it isn't a number. */
export function parseMoney(input: string): number | null {
  const t = input.replace(/[$,\s]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  return Number(t);
}
