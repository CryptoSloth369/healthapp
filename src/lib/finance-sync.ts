/**
 * Pure helpers for syncing Plaid data. No I/O.
 */
import { kindFromPlaid, type AccountKind } from "./finance";
import type { PlaidAccount } from "./plaid";

/** Refresh connections at most this often on page loads (Sync forces it). */
export const SYNC_MAX_AGE_HOURS = 6;

export type PlaidAccountRow = {
  plaid_account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  plaid_type: string;
  plaid_subtype: string | null;
  kind: AccountKind;
  balance: number;
  available: number | null;
  credit_limit: number | null;
  currency: string;
};

/**
 * Plaid reports what you have (bank, investments) and what you owe (cards,
 * loans) as positive `current` balances, which matches how we store them.
 */
export function accountRowFromPlaid(a: PlaidAccount): PlaidAccountRow {
  return {
    plaid_account_id: a.account_id,
    name: a.name.slice(0, 80) || "Account",
    official_name: a.official_name ?? null,
    mask: a.mask ?? null,
    plaid_type: a.type,
    plaid_subtype: a.subtype ?? null,
    kind: kindFromPlaid(a.type, a.subtype),
    balance: a.balances.current ?? a.balances.available ?? 0,
    available: a.balances.available ?? null,
    credit_limit: a.balances.limit ?? null,
    currency: a.balances.iso_currency_code ?? a.balances.unofficial_currency_code ?? "USD",
  };
}

export function isSyncDue(lastSyncedAt: string | null, now: Date, maxAgeHours = SYNC_MAX_AGE_HOURS): boolean {
  if (!lastSyncedAt) return true;
  return now.getTime() - Date.parse(lastSyncedAt) >= maxAgeHours * 3_600_000;
}
