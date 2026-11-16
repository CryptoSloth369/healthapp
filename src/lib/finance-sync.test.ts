import { describe, expect, it } from "vitest";
import { accountRowFromPlaid, isSyncDue } from "./finance-sync";

describe("accountRowFromPlaid", () => {
  it("maps a credit card (positive = owed) and keeps the limit", () => {
    const r = accountRowFromPlaid({
      account_id: "abc",
      name: "Plaid Credit Card",
      official_name: "Plaid Diamond 12.5% APR Interest Credit Card",
      mask: "3333",
      type: "credit",
      subtype: "credit card",
      balances: { current: 410, available: null, limit: 2000, iso_currency_code: "USD" },
    });
    expect(r).toMatchObject({ kind: "credit", balance: 410, credit_limit: 2000, mask: "3333", currency: "USD" });
  });

  it("falls back to available, then 0, and classifies retirement", () => {
    const r = accountRowFromPlaid({
      account_id: "x",
      name: "",
      type: "investment",
      subtype: "401k",
      balances: { current: null, available: 1200 },
    });
    expect(r).toMatchObject({ name: "Account", kind: "retirement", balance: 1200, currency: "USD" });
    expect(accountRowFromPlaid({ account_id: "y", name: "z", type: "depository", subtype: "checking", balances: {} }).balance).toBe(0);
  });
});

describe("isSyncDue", () => {
  const now = new Date("2026-11-16T12:00:00Z");
  it("is due when never synced or older than 6 hours", () => {
    expect(isSyncDue(null, now)).toBe(true);
    expect(isSyncDue("2026-11-16T06:00:00Z", now)).toBe(true);
    expect(isSyncDue("2026-11-16T07:00:00Z", now)).toBe(false);
  });
});
