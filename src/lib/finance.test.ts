import { describe, expect, it } from "vitest";
import { debtGroup, formatMoney, kindFromPlaid, netWorthSeries, parseMoney, totals, type MoneyAccount } from "./finance";

describe("kindFromPlaid", () => {
  it("sorts Plaid accounts into our kinds", () => {
    expect(kindFromPlaid("depository", "checking")).toBe("cash");
    expect(kindFromPlaid("depository", "hsa")).toBe("retirement");
    expect(kindFromPlaid("credit", "credit card")).toBe("credit");
    expect(kindFromPlaid("loan", "student")).toBe("loan");
    expect(kindFromPlaid("investment", "brokerage")).toBe("investment");
    expect(kindFromPlaid("investment", "crypto exchange")).toBe("investment");
    expect(kindFromPlaid("investment", "401k")).toBe("retirement");
    expect(kindFromPlaid("investment", "Roth")).toBe("retirement");
    expect(kindFromPlaid("other", null)).toBe("other_asset");
  });

  it("groups debts for display", () => {
    expect(debtGroup("loan", "student")).toBe("Student loans");
    expect(debtGroup("loan", "mortgage")).toBe("Mortgage & home equity");
    expect(debtGroup("credit", "credit card")).toBe("Credit cards");
    expect(debtGroup("loan", "personal")).toBe("Other loans");
  });
});

const acc = (id: string, kind: MoneyAccount["kind"], balance: number, extra: Partial<MoneyAccount> = {}): MoneyAccount => ({
  id,
  kind,
  balance,
  subtype: null,
  hidden: false,
  ...extra,
});

describe("totals", () => {
  it("adds assets, subtracts debts, skips hidden accounts", () => {
    const t = totals([
      acc("1", "cash", 5000.1),
      acc("2", "investment", 20000),
      acc("3", "retirement", 50000),
      acc("4", "credit", 1200.55),
      acc("5", "loan", 30000, { subtype: "student" }),
      acc("6", "other_asset", 99999, { hidden: true }),
    ]);
    expect(t.byKind).toMatchObject({ cash: 5000.1, investment: 20000, retirement: 50000, credit: 1200.55, loan: 30000, other_asset: 0 });
    expect(t.assets).toBe(75000.1);
    expect(t.debts).toBe(31200.55);
    expect(t.netWorth).toBe(43799.55);
    expect(t.debtGroups).toEqual([
      { label: "Student loans", amount: 30000 },
      { label: "Credit cards", amount: 1200.55 },
    ]);
  });
});

describe("netWorthSeries", () => {
  it("carries balances forward and starts each account at its first snapshot", () => {
    const accounts = [acc("cash", "cash", 0), acc("card", "credit", 0), acc("old", "cash", 0, { hidden: true })];
    const s = netWorthSeries(
      [
        { accountId: "cash", day: "2026-01-01", balance: 1000 },
        { accountId: "old", day: "2026-01-01", balance: 5000 },
        { accountId: "card", day: "2026-01-02", balance: 300 },
        { accountId: "cash", day: "2026-01-03", balance: 1500 },
      ],
      accounts,
    );
    expect(s).toEqual([
      { day: "2026-01-01", assets: 1000, debts: 0, netWorth: 1000 },
      { day: "2026-01-02", assets: 1000, debts: 300, netWorth: 700 },
      { day: "2026-01-03", assets: 1500, debts: 300, netWorth: 1200 },
    ]);
  });
});

describe("money text", () => {
  it("formats and parses", () => {
    expect(formatMoney(12345.6)).toBe("$12,346");
    expect(formatMoney(-1234.5, { cents: true })).toBe("−$1,234.50");
    expect(parseMoney("$1,234.50")).toBe(1234.5);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});
