import { describe, expect, it, vi } from "vitest";
import type { AccountView, ItemView } from "@/lib/money-data";
import type { BalancePoint } from "@/lib/finance";
import type { Txn } from "@/lib/spending";

// Stand-ins for the Supabase-backed loaders the tools read through.
vi.mock("server-only", () => ({}));

const account = (id: string, kind: AccountView["kind"], balance: number, extra: Partial<AccountView> = {}): AccountView => ({
  id,
  item_id: "item1",
  name: id,
  display_name: null,
  official_name: null,
  mask: null,
  plaid_subtype: null,
  kind,
  balance,
  available: null,
  credit_limit: null,
  is_manual: false,
  shared: true,
  hidden: false,
  balance_updated_at: "2026-11-18T12:00:00Z",
  mine: true,
  ownerName: "Me",
  ...extra,
});
const accounts: AccountView[] = [
  account("chk", "cash", 3000, { display_name: "Checking", mask: "1111" }),
  account("card", "credit", 500, { name: "Visa", credit_limit: 2000, mask: "2222" }),
  account("partner-card", "credit", 100, { name: "Amex", mine: false, ownerName: "Sam" }),
  account("loan", "loan", 10000, { plaid_subtype: "student" }),
  account("old", "cash", 999, { hidden: true }),
  account("house", "other_asset", 200000, { item_id: null, is_manual: true }),
];
const items: ItemView[] = [{ id: "item1", institution_name: "Test Bank", products: ["transactions"], status: "ok", error: null, last_synced_at: "2026-11-18T12:00:00Z", mine: true }];
const history: BalancePoint[] = [
  { accountId: "chk", day: "2026-11-01", balance: 2000 },
  { accountId: "card", day: "2026-11-01", balance: 300 },
  { accountId: "chk", day: "2026-11-10", balance: 2500 },
  { accountId: "house", day: "2026-11-12", balance: 200000 }, // added later: a jump, not a gain
  { accountId: "chk", day: "2026-11-18", balance: 3000 },
];
let n = 0;
const tx = (account_id: string, day: string, amount: number, extra: Partial<Txn> = {}): Txn => ({
  id: String(++n),
  account_id,
  day,
  amount,
  name: "Store",
  merchant_name: null,
  pending: false,
  pfc_primary: "GENERAL_MERCHANDISE",
  pfc_detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE",
  category_override: null,
  ...extra,
});
const grocery = { pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_GROCERIES" };
const txns: Txn[] = [
  tx("card", "2026-11-15", 60, { merchant_name: "Costco", ...grocery, pending: true }),
  tx("card", "2026-11-03", 40, { merchant_name: "Costco", ...grocery }),
  tx("card", "2026-10-20", 25, { name: "Corner Cafe" }), // rule → dining
  tx("partner-card", "2026-11-04", 15, { name: "Book Shop" }),
  tx("chk", "2026-11-05", 80, { name: "Gas Station", pfc_primary: "TRANSPORTATION", pfc_detailed: "TRANSPORTATION_GAS" }),
  tx("chk", "2026-11-06", 500, { name: "Visa payment", pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
  tx("card", "2026-11-06", -500, { name: "Payment thanks", pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
  tx("chk", "2026-11-15", -2000, { name: "Payroll", pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES" }),
];
const getTransactions = vi.fn(async (ids: string[], from: string, to: string) =>
  txns.filter((t) => ids.includes(t.account_id) && t.day >= from && t.day <= to).sort((a, b) => b.day.localeCompare(a.day)),
);
vi.mock("@/lib/money-data", () => ({ getMoney: async () => ({ householdId: "h", userId: "u", accounts, items }), getBalanceHistory: async () => history }));
vi.mock("@/lib/spending-data", () => ({ getTransactions, getCategoryRules: async () => [{ id: "r1", match: "corner cafe", category: "dining" }] }));
vi.mock("@/lib/energy-data", () => ({ ensureFreshEnergy: async () => ({}), readEnergyDays: async () => [] }));
vi.mock("@/lib/weight", () => ({ getWeightHistory: async () => ({ points: [], rateLbPerWeek: null, entries: [] }) }));
vi.mock("@/lib/profile", () => ({ getProfileSummary: async () => null }));
vi.mock("@/lib/food", () => ({ getEntriesBetween: async () => [], getEntriesDetailed: async () => [] }));
vi.mock("@/lib/exercise-data", () => ({ getSessions: async () => [], getTemplates: async () => [] }));
vi.mock("@/lib/mood-data", () => ({ getMoodEntries: async () => [] }));
vi.mock("@/lib/journal-data", () => ({ getJournalEntries: async () => [] }));

const { runTool } = await import("./tools");
const ctx = { today: "2026-11-19" };
const call = async (name: string, input: unknown) => {
  const r = await runTool(name, input, ctx);
  expect(r.ok, r.content).toBe(true);
  return JSON.parse(r.content);
};

describe("get_money_accounts", () => {
  it("lists visible accounts with owners and totals that skip hidden accounts", async () => {
    const out = await call("get_money_accounts", {});
    expect(out.totals).toMatchObject({ assets: 203000, debts: 10600, net_worth: 192400 });
    expect(out.totals.debts_by_type).toEqual([
      { label: "Student loans", amount: 10000 },
      { label: "Credit cards", amount: 600 },
    ]);
    const byId = Object.fromEntries(out.accounts.map((a: { id: string }) => [a.id, a]));
    expect(byId.chk).toMatchObject({ name: "Checking ••1111", institution: "Test Bank", type: "Cash", is_debt: false, owner: "you" });
    expect(byId.card).toMatchObject({ utilization_pct: 25, credit_limit: 2000, is_debt: true });
    expect(byId["partner-card"].owner).toBe("Sam");
    expect(byId.old.left_out_of_totals).toBe(true);
    expect(byId.house.institution).toBe("entered by hand");
    expect(out.connections).toEqual([{ institution: "Test Bank", status: "ok", last_synced_at: "2026-11-18T12:00:00Z", connected_by_you: true }]);
  });
});

describe("get_net_worth", () => {
  it("returns the change over the range and flags accounts that were added", async () => {
    const out = await call("get_net_worth", { start: "2026-11-05", end: "2026-11-30" });
    expect(out.range).toEqual({ start: "2026-11-05", end: "2026-11-19" }); // clamped to today
    expect(out.at_start).toEqual({ day: "2026-11-01", net_worth: 1700, assets: 2000, debts: 300 });
    expect(out.at_end).toEqual({ day: "2026-11-18", net_worth: 202700, assets: 203000, debts: 300 });
    expect(out.change.net_worth).toBe(201000);
    expect(out.accounts_first_seen_in_range).toEqual([{ account: "house", type: "Other assets", first_day: "2026-11-12", balance_now: 200000 }]);
    expect(out.step).toBe("day");
    expect(out.series.map((p: { day: string }) => p.day)).toEqual(["2026-11-10", "2026-11-12", "2026-11-18"]);
  });

  it("defaults to the last year and thins to weeks", async () => {
    const out = await call("get_net_worth", {});
    expect(out.range).toEqual({ start: "2025-11-20", end: "2026-11-19" });
    expect(out.step).toBe("week");
    expect(out.first_snapshot_day).toBe("2026-11-01");
  });

  it("refuses a range over the cap", async () => {
    expect(await runTool("get_net_worth", { start: "2020-01-01", end: "2026-11-19" }, ctx)).toMatchObject({ ok: false });
  });
});

describe("get_spending", () => {
  it("defaults to credit cards (including family-shared ones) and leaves out card payments", async () => {
    const out = await call("get_spending", { start: "2026-11-01", end: "2026-11-30" });
    expect(out.accounts.map((a: { id: string }) => a.id)).toEqual(["card", "partner-card"]);
    expect(out.total_spending).toBe(115);
    expect(out.pending_transactions).toBe(1);
    expect(out.by_category).toEqual([
      { id: "groceries", category: "Groceries", total: 100, count: 2, share_pct: 87 },
      { id: "shopping", category: "Shopping", total: 15, count: 1, share_pct: 13 },
    ]);
    expect(out.top_merchants[0]).toEqual({ merchant: "Costco", total: 100, count: 2, categories: ["Groceries"] });
    expect(out.not_spending.transfer).toEqual({ in: 500, out: 0, count: 1 });
  });

  it("can include bank accounts, filter a category, and apply family rules", async () => {
    const all = await call("get_spending", { start: "2026-10-01", end: "2026-11-30", accounts: "all" });
    expect(all.total_spending).toBe(220);
    expect(all.by_month).toEqual([
      { month: "2026-10", total: 25, count: 1 },
      { month: "2026-11", total: 195, count: 4 },
    ]);
    expect(all.not_spending.income).toEqual({ in: 2000, out: 0, count: 1 });
    const dining = await call("get_spending", { start: "2026-10-01", end: "2026-11-30", category: "dining" });
    expect(dining).toMatchObject({ category: "Dining out", total_spending: 25 });
    expect(dining.not_spending).toBeUndefined();
  });

  it("explains a bad account filter and rejects non-spending categories", async () => {
    const r = await runTool("get_spending", { start: "2026-11-01", end: "2026-11-30", accounts: "loan" }, ctx);
    expect(r).toMatchObject({ ok: false });
    expect(r.content).toContain("chk (Checking ••1111, Cash)");
    expect(await runTool("get_spending", { start: "2026-11-01", end: "2026-11-30", category: "income" }, ctx)).toMatchObject({ ok: false });
    expect(await runTool("get_spending", { start: "2025-01-01", end: "2026-11-30" }, ctx)).toMatchObject({ ok: false });
  });
});

describe("get_transactions", () => {
  it("lists transactions with category sources, filtered by text", async () => {
    const out = await call("get_transactions", { start: "2026-10-01", end: "2026-11-19", search: "cafe" });
    expect(out.matched).toBe(1);
    expect(out.transactions[0]).toEqual({ day: "2026-10-20", merchant: "Corner Cafe", amount: 25, category: "Dining out", category_from: 'rule "corner cafe"', account: "Visa ••2222" });
  });

  it("defaults to all accounts and filters by any category", async () => {
    const out = await call("get_transactions", { start: "2026-11-01", end: "2026-11-19", category: "income" });
    expect(out.transactions).toEqual([{ day: "2026-11-15", merchant: "Payroll", amount: -2000, category: "Income & refunds", category_from: "bank", account: "Checking ••1111" }]);
    expect(out.net_amount).toBe(-2000);
    const pending = await call("get_transactions", { start: "2026-11-15", end: "2026-11-15", accounts: "card" });
    expect(pending.transactions[0]).toMatchObject({ merchant: "Costco", pending: true });
  });
});

describe("get_category_rules", () => {
  it("lists categories and the family's rules", async () => {
    const out = await call("get_category_rules", {});
    expect(out.rules).toEqual([{ match: "corner cafe", category: "Dining out" }]);
    expect(out.categories.find((c: { id: string }) => c.id === "transfer")).toEqual({ id: "transfer", name: "Transfers & card payments", counts_as_spending: false });
  });
});
