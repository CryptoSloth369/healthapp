import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAll, dbError } from "@/lib/supabase/read-all";
import { getMoney } from "@/lib/money-data";
import { chooseAccounts, monthRange, shiftMonth, spendableAccounts, type Txn } from "@/lib/spending";

export type RuleRow = { id: string; match: string; category: string };

const TXN_COLS = "id, account_id, day, amount, name, merchant_name, pending, pfc_primary, pfc_detailed, category_override";

/** Transactions on the given accounts between two days (inclusive), newest first. RLS limits them to accounts you can see. */
export async function getTransactions(accountIds: string[], from: string, to: string): Promise<Txn[]> {
  if (!accountIds.length) return [];
  const supabase = await createClient();
  const rows = await readAll<Txn>("Reading transactions", (a, b) =>
    supabase
      .from("fin_transaction")
      .select(TXN_COLS)
      .in("account_id", accountIds)
      .gte("day", from)
      .lte("day", to)
      .order("day", { ascending: false })
      .order("id")
      .range(a, b),
  );
  return rows.map((t) => ({ ...t, amount: Number(t.amount) }));
}

/** Your family's merchant → category rules. */
export async function getCategoryRules(): Promise<RuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_category_rule").select("id, match, category").order("match").overrideTypes<RuleRow[], { merge: false }>();
  if (error) throw dbError("Reading category rules", error);
  return data ?? [];
}

export async function getSpending(month: string, filter: string) {
  const { accounts } = await getMoney();
  const spendable = spendableAccounts(accounts);
  const chosen = chooseAccounts(spendable, filter);
  const [txns, rules] = await Promise.all([
    getTransactions(
      chosen.map((a) => a.id),
      monthRange(shiftMonth(month, -1)).start,
      monthRange(month).end,
    ),
    getCategoryRules(),
  ]);
  return { accounts: spendable, chosen, txns, rules };
}
