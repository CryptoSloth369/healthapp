import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAll, dbError } from "@/lib/supabase/read-all";
import { getMoney, type AccountView } from "@/lib/money-data";
import { monthRange, shiftMonth, type Txn } from "@/lib/spending";

export type RuleRow = { id: string; match: string; category: string };
/** "cards" (default), "all" (cards + bank accounts), or one account id. */
export type SpendingFilter = string;

export async function getSpending(month: string, filter: SpendingFilter) {
  const { accounts } = await getMoney();
  const spendable = accounts.filter((a) => a.kind === "credit" || a.kind === "cash");
  const chosen: AccountView[] =
    filter === "all" ? spendable : filter === "cards" ? spendable.filter((a) => a.kind === "credit") : spendable.filter((a) => a.id === filter);
  const supabase = await createClient();
  const from = monthRange(shiftMonth(month, -1)).start;
  const to = monthRange(month).end;
  const ids = chosen.map((a) => a.id);
  const [txns, { data: rules, error }] = await Promise.all([
    ids.length
      ? readAll<Txn>("Reading transactions", (a, b) =>
          supabase
            .from("fin_transaction")
            .select("id, account_id, day, amount, name, merchant_name, pending, pfc_primary, pfc_detailed, category_override")
            .in("account_id", ids)
            .gte("day", from)
            .lte("day", to)
            .order("day", { ascending: false })
            .range(a, b),
        )
      : Promise.resolve([] as Txn[]),
    supabase.from("fin_category_rule").select("id, match, category").order("match").overrideTypes<RuleRow[], { merge: false }>(),
  ]);
  if (error) throw dbError("Reading category rules", error);
  return {
    accounts: spendable,
    chosen,
    txns: txns.map((t) => ({ ...t, amount: Number(t.amount) })),
    rules: rules ?? [],
  };
}
