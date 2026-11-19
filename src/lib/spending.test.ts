import { describe, expect, it } from "vitest";
import {
  categoryFromPlaid,
  categoryWithSource,
  chooseAccounts,
  notSpendingTotals,
  spendableAccounts,
  spendingByMerchant,
  spendingByMonth,
  donutSlices,
  effectiveCategory,
  isMonth,
  merchantKey,
  monthRange,
  shiftMonth,
  spendingByCategory,
  type Txn,
} from "./spending";

let n = 0;
const tx = (amount: number, extra: Partial<Txn> = {}): Txn => ({
  id: String(++n),
  account_id: "card",
  day: "2026-11-10",
  amount,
  name: "Store",
  merchant_name: null,
  pending: false,
  pfc_primary: "GENERAL_MERCHANDISE",
  pfc_detailed: "GENERAL_MERCHANDISE_OTHER_GENERAL_MERCHANDISE",
  category_override: null,
  ...extra,
});

describe("categories", () => {
  it("maps Plaid categories, splitting out groceries and card payments", () => {
    expect(categoryFromPlaid("FOOD_AND_DRINK", "FOOD_AND_DRINK_GROCERIES")).toBe("groceries");
    expect(categoryFromPlaid("FOOD_AND_DRINK", "FOOD_AND_DRINK_RESTAURANT")).toBe("dining");
    expect(categoryFromPlaid("LOAN_PAYMENTS", "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT")).toBe("transfer");
    expect(categoryFromPlaid("LOAN_PAYMENTS", "LOAN_PAYMENTS_STUDENT_LOAN_PAYMENT")).toBe("loan_payments");
    expect(categoryFromPlaid("ENTERTAINMENT", "ENTERTAINMENT_TV_AND_MOVIES")).toBe("subscriptions");
    expect(categoryFromPlaid(null, null)).toBe("other");
  });

  it("prefers a person's choice, then the longest matching rule, then Plaid", () => {
    const rules = [
      { match: "amazon", category: "shopping" },
      { match: "amazon prime", category: "subscriptions" },
    ];
    expect(effectiveCategory(tx(10, { merchant_name: "Amazon Prime" }), rules)).toBe("subscriptions");
    expect(effectiveCategory(tx(10, { name: "AMAZON MKTPL*123" }), rules)).toBe("shopping");
    expect(effectiveCategory(tx(10, { merchant_name: "Amazon", category_override: "groceries" }), rules)).toBe("groceries");
    expect(effectiveCategory(tx(10), rules)).toBe("shopping");
    expect(merchantKey(tx(1, { merchant_name: " Costco ", name: "COSTCO WHSE #1" }))).toBe("costco");
  });
});

describe("spendingByCategory", () => {
  it("adds spending, nets refunds, skips transfers and income", () => {
    const r = spendingByCategory(
      [
        tx(120, { pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_GROCERIES" }),
        tx(30, { pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_GROCERIES" }),
        tx(80),
        tx(-20), // refund at a store
        tx(-500, { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" }),
        tx(-15, { pfc_primary: "INCOME", pfc_detailed: "INCOME_OTHER_INCOME" }),
        tx(-40, { pfc_primary: "TRAVEL", pfc_detailed: "TRAVEL_FLIGHTS" }), // only a refund: left out
      ],
      [],
    );
    expect(r.categories).toEqual([
      { category: "groceries", label: "Groceries", total: 150, count: 2 },
      { category: "shopping", label: "Shopping", total: 60, count: 2 },
    ]);
    expect(r.total).toBe(210);
  });

  it("folds small categories into one slice", () => {
    const cats = Array.from({ length: 10 }, (_, i) => ({ category: `c${i}`, label: `C${i}`, total: 100 - i, count: 1 }));
    const s = donutSlices(cats);
    expect(s).toHaveLength(8);
    expect(s[7]).toEqual({ category: "_rest", label: "3 more", total: 93 + 92 + 91, count: 3 });
    expect(donutSlices(cats.slice(0, 8))).toHaveLength(8);
  });
});

describe("months", () => {
  it("gives ranges and steps across years", () => {
    expect(monthRange("2026-02")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(monthRange("2028-02").end).toBe("2028-02-29");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(isMonth("2026-13")).toBe(false);
    expect(isMonth("2026-11")).toBe(true);
  });
});

describe("coach summaries", () => {
  const grocery = { pfc_primary: "FOOD_AND_DRINK", pfc_detailed: "FOOD_AND_DRINK_GROCERIES" };
  const payment = { pfc_primary: "LOAN_PAYMENTS", pfc_detailed: "LOAN_PAYMENTS_CREDIT_CARD_PAYMENT" };
  const txns = [
    tx(100, { day: "2026-10-03", merchant_name: "Costco", ...grocery }),
    tx(50, { day: "2026-11-02", merchant_name: "Costco", name: "COSTCO WHSE", ...grocery }),
    tx(30, { day: "2026-11-05", name: "Corner Store" }),
    tx(-10, { day: "2026-11-06", name: "Corner Store" }), // refund
    tx(-5, { day: "2026-11-07", name: "Returned item" }), // only a refund: no merchant row
    tx(-400, { day: "2026-11-08", name: "Payment thank you", ...payment }),
    tx(400, { day: "2026-11-08", name: "Card payment", pfc_primary: "TRANSFER_OUT", pfc_detailed: "TRANSFER_OUT_ACCOUNT_TRANSFER" }),
    tx(-2000, { day: "2026-11-15", name: "Payroll", pfc_primary: "INCOME", pfc_detailed: "INCOME_WAGES" }),
  ];

  it("says where a category came from", () => {
    const rules = [{ match: "corner", category: "groceries" }];
    expect(categoryWithSource(txns[2], rules)).toEqual({ category: "groceries", source: "rule", rule: "corner" });
    expect(categoryWithSource({ ...txns[2], category_override: "dining" }, rules)).toEqual({ category: "dining", source: "person" });
    expect(categoryWithSource(txns[0], rules)).toEqual({ category: "groceries", source: "bank" });
  });

  it("totals spending by month, leaving out transfers and income", () => {
    expect(spendingByMonth(txns, [])).toEqual([
      { month: "2026-10", total: 100, count: 1 },
      { month: "2026-11", total: 65, count: 4 },
    ]);
  });

  it("ranks merchants, grouping by merchant name and netting refunds", () => {
    expect(spendingByMerchant(txns, [])).toEqual([
      { merchant: "Costco", total: 150, count: 2, categories: ["Groceries"] },
      { merchant: "Corner Store", total: 20, count: 2, categories: ["Shopping"] },
    ]);
    expect(spendingByMerchant(txns, [], 1)).toHaveLength(1);
  });

  it("adds up money in and out that isn't spending", () => {
    expect(notSpendingTotals(txns, [])).toEqual({
      income: { in: 2000, out: 0, count: 1 },
      transfer: { in: 400, out: 400, count: 2 },
    });
  });

  it("chooses accounts like the Spending tab", () => {
    const accts = [
      { id: "card", kind: "credit" },
      { id: "chk", kind: "cash" },
      { id: "brk", kind: "investment" },
    ];
    const spendable = spendableAccounts(accts);
    expect(spendable.map((a) => a.id)).toEqual(["card", "chk"]);
    expect(chooseAccounts(spendable, "cards").map((a) => a.id)).toEqual(["card"]);
    expect(chooseAccounts(spendable, "all").map((a) => a.id)).toEqual(["card", "chk"]);
    expect(chooseAccounts(spendable, "chk").map((a) => a.id)).toEqual(["chk"]);
    expect(chooseAccounts(spendable, "brk")).toEqual([]);
  });
});
