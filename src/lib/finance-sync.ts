/**
 * Pure helpers for syncing Plaid data. No I/O.
 */
import { kindFromPlaid, type AccountKind } from "./finance";
import type { PlaidAccount, PlaidTransaction } from "./plaid";

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

export type TxnRow = {
  account_id: string;
  plaid_transaction_id: string;
  day: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  pending: boolean;
  pfc_primary: string | null;
  pfc_detailed: string | null;
};

/**
 * Plaid transactions → rows, for accounts we store (others are skipped).
 * category_override is never included, so a person's choice survives updates.
 */
export function txnRows(txns: PlaidTransaction[], accountIdByPlaid: Map<string, string>): TxnRow[] {
  const out: TxnRow[] = [];
  for (const t of txns) {
    const account_id = accountIdByPlaid.get(t.account_id);
    if (!account_id) continue;
    out.push({
      account_id,
      plaid_transaction_id: t.transaction_id,
      day: t.date,
      amount: t.amount,
      name: (t.name || t.merchant_name || "Transaction").slice(0, 200),
      merchant_name: t.merchant_name ?? null,
      pending: !!t.pending,
      pfc_primary: t.personal_finance_category?.primary ?? null,
      pfc_detailed: t.personal_finance_category?.detailed ?? null,
    });
  }
  return out;
}
