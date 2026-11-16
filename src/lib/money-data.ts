import "server-only";
import { createClient, getUserId } from "@/lib/supabase/server";
import { dbError, readAll } from "@/lib/supabase/read-all";
import { ensureHouseholdId } from "@/lib/family-data";
import { open, seal } from "@/lib/secret-box";
import { CONNECTION_PRODUCTS, exchangePublicToken, getAccounts, PlaidError, removeItem, type ConnectionType } from "@/lib/plaid";
import { accountRowFromPlaid, isSyncDue } from "@/lib/finance-sync";
import type { AccountKind, BalancePoint } from "@/lib/finance";

export type AccountView = {
  id: string;
  item_id: string | null;
  name: string;
  display_name: string | null;
  official_name: string | null;
  mask: string | null;
  plaid_subtype: string | null;
  kind: AccountKind;
  balance: number;
  available: number | null;
  credit_limit: number | null;
  is_manual: boolean;
  shared: boolean;
  hidden: boolean;
  balance_updated_at: string;
  /** Owned by the signed-in person (they can rename, share, delete). */
  mine: boolean;
  ownerName: string | null;
};

export type ItemView = {
  id: string;
  institution_name: string | null;
  products: string[];
  status: "ok" | "login_required" | "error";
  error: string | null;
  last_synced_at: string | null;
  mine: boolean;
};

const ACCOUNT_COLS =
  "id, item_id, owner_user_id, name, display_name, official_name, mask, plaid_subtype, kind, balance, available, credit_limit, is_manual, shared, hidden, balance_updated_at";
type AccountRow = Omit<AccountView, "mine" | "ownerName"> & { owner_user_id: string };
const num = (v: unknown) => (v == null ? null : Number(v));

/** Everything Money shows: accounts you can see (yours + shared) and your family's connections. */
export async function getMoney() {
  const [userId, householdId] = await Promise.all([getUserId(), ensureHouseholdId()]);
  const supabase = await createClient();
  const [accounts, { data: items, error: itemErr }, { data: members }] = await Promise.all([
    readAll<AccountRow>("Reading accounts", (a, b) => supabase.from("fin_account").select(ACCOUNT_COLS).order("created_at").range(a, b)),
    supabase
      .from("fin_item")
      .select("id, owner_user_id, institution_name, products, status, error, last_synced_at")
      .order("created_at")
      .overrideTypes<(Omit<ItemView, "mine"> & { owner_user_id: string })[], { merge: false }>(),
    supabase.rpc("household_members"),
  ]);
  if (itemErr) throw dbError("Reading connections", itemErr);
  const names = new Map(((members ?? []) as { user_id: string; display_name: string | null }[]).map((m) => [m.user_id, m.display_name]));
  return {
    householdId,
    userId: userId!,
    accounts: accounts.map(
      (a): AccountView => ({
        ...a,
        balance: Number(a.balance),
        available: num(a.available),
        credit_limit: num(a.credit_limit),
        mine: a.owner_user_id === userId,
        ownerName: names.get(a.owner_user_id) ?? null,
      }),
    ),
    items: (items ?? []).map((i) => ({ ...i, mine: i.owner_user_id === userId })),
  };
}

/** Daily balances for the accounts you can see, oldest first. */
export async function getBalanceHistory(since: string): Promise<BalancePoint[]> {
  const supabase = await createClient();
  const rows = await readAll<{ account_id: string; day: string; balance: number }>("Reading balance history", (a, b) =>
    supabase.from("fin_balance").select("account_id, day, balance").gte("day", since).order("day").range(a, b),
  );
  return rows.map((r) => ({ accountId: r.account_id, day: r.day, balance: Number(r.balance) }));
}

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ItemRow = { id: string; household_id: string; owner_user_id: string; access_token_enc: string; status: string; last_synced_at: string | null };

/**
 * Refresh one connection's accounts from Plaid and record today's balances.
 * Accounts new at the bank are added only when you own the connection
 * (row-level security: a new row's owner must be you).
 */
async function syncItem(supabase: Supabase, item: ItemRow, userId: string, today: string) {
  try {
    const { accounts } = await getAccounts(open(item.access_token_enc));
    const rows = accounts.map(accountRowFromPlaid);
    const { data: existing, error } = await supabase
      .from("fin_account")
      .select("id, plaid_account_id")
      .in("plaid_account_id", rows.map((r) => r.plaid_account_id));
    if (error) throw dbError("Reading accounts", error);
    const idByPlaid = new Map((existing ?? []).map((e) => [e.plaid_account_id as string, e.id as string]));
    const now = new Date().toISOString();
    for (const r of rows) {
      const id = idByPlaid.get(r.plaid_account_id);
      // Keep the person's own choices (display name, kind override, sharing, hidden) on updates.
      const fresh = { name: r.name, official_name: r.official_name, mask: r.mask, balance: r.balance, available: r.available, credit_limit: r.credit_limit, currency: r.currency, balance_updated_at: now };
      if (id) {
        const { error: e } = await supabase.from("fin_account").update(fresh).eq("id", id);
        if (e) throw dbError("Updating an account", e);
      } else if (item.owner_user_id === userId) {
        const { data: ins, error: e } = await supabase
          .from("fin_account")
          .insert({ ...r, household_id: item.household_id, owner_user_id: userId, item_id: item.id, balance_updated_at: now })
          .select("id")
          .single<{ id: string }>();
        if (e) throw dbError("Adding an account", e);
        idByPlaid.set(r.plaid_account_id, ins.id);
      }
    }
    const snaps = rows
      .filter((r) => idByPlaid.has(r.plaid_account_id))
      .map((r) => ({ account_id: idByPlaid.get(r.plaid_account_id)!, day: today, balance: r.balance }));
    if (snaps.length) {
      const { error: e } = await supabase.from("fin_balance").upsert(snaps, { onConflict: "account_id,day" });
      if (e) throw dbError("Saving balances", e);
    }
    await supabase.from("fin_item").update({ status: "ok", error: null, last_synced_at: now }).eq("id", item.id);
    return null;
  } catch (err) {
    const loginRequired = err instanceof PlaidError && err.loginRequired;
    const message = (err as Error).message;
    await supabase
      .from("fin_item")
      .update({ status: loginRequired ? "login_required" : "error", error: message.slice(0, 500) })
      .eq("id", item.id);
    return message;
  }
}

/**
 * Refresh connections that are due (or all, with `force`), and record today's
 * balance for manual accounts. Returns problems to show; never throws for a
 * single bank failing.
 */
export async function syncMoney(opts: { today: string; force?: boolean }): Promise<{ synced: number; errors: string[] }> {
  const userId = await getUserId();
  if (!userId) return { synced: 0, errors: [] };
  await ensureHouseholdId();
  const supabase = await createClient();
  const { data: items, error } = await supabase
    .from("fin_item")
    .select("id, household_id, owner_user_id, access_token_enc, status, last_synced_at")
    .overrideTypes<ItemRow[], { merge: false }>();
  if (error) throw dbError("Reading connections", error);
  const now = new Date();
  const due = (items ?? []).filter((i) => opts.force || (i.status !== "login_required" && isSyncDue(i.last_synced_at, now)));
  const errors = (await Promise.all(due.map((i) => syncItem(supabase, i, userId, opts.today)))).filter((e): e is string => !!e);

  // Manual balances carry forward once a day so the net-worth chart has today's value.
  const { data: manual } = await supabase.from("fin_account").select("id, balance").eq("is_manual", true).eq("owner_user_id", userId);
  if (manual?.length) await supabase.from("fin_balance").upsert(manual.map((m) => ({ account_id: m.id, day: opts.today, balance: m.balance })), { onConflict: "account_id,day", ignoreDuplicates: true });

  return { synced: due.length - errors.length, errors };
}

/** Finish Plaid Link: store the encrypted access token and pull the accounts. */
export async function connectItem(opts: { publicToken: string; institutionId: string | null; institutionName: string | null; type: ConnectionType; today: string }) {
  const userId = await getUserId();
  if (!userId) throw new Error("You are signed out.");
  const householdId = await ensureHouseholdId();
  const { access_token, item_id } = await exchangePublicToken(opts.publicToken);
  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("fin_item")
    .insert({
      household_id: householdId,
      plaid_item_id: item_id,
      access_token_enc: seal(access_token),
      institution_id: opts.institutionId,
      institution_name: opts.institutionName,
      products: CONNECTION_PRODUCTS[opts.type],
    })
    .select("id, household_id, owner_user_id, access_token_enc, status, last_synced_at")
    .single<ItemRow>();
  if (error) {
    // Don't leave a paid connection behind that we can't use.
    await removeItem(access_token).catch(() => {});
    throw dbError("Saving the connection", error);
  }
  const problem = await syncItem(supabase, item, userId, opts.today);
  if (problem) throw new Error(problem);
}

/** Read an item's access token (for reconnecting), if you can see the item. */
export async function itemAccessToken(itemId: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_item").select("access_token_enc").eq("id", itemId).single<{ access_token_enc: string }>();
  if (error) throw dbError("Reading the connection", error);
  return open(data.access_token_enc);
}

/** Disconnect a bank: stop Plaid billing, then delete its accounts and history. Owner only. */
export async function removeConnection(itemId: string): Promise<string | null> {
  const userId = await getUserId();
  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("fin_item")
    .select("access_token_enc, owner_user_id")
    .eq("id", itemId)
    .single<{ access_token_enc: string; owner_user_id: string }>();
  if (error) throw dbError("Reading the connection", error);
  // Check before calling Plaid: a family member must not be able to cut off your bank.
  if (item.owner_user_id !== userId) throw new Error("Only the person who connected this bank can remove it.");
  let warning: string | null = null;
  try {
    await removeItem(open(item.access_token_enc));
  } catch (err) {
    // Already removed at Plaid, or Plaid is down: still delete it here, but say so.
    warning = `Plaid said: ${(err as Error).message}. Removed here anyway.`;
  }
  const { data: gone, error: delErr } = await supabase.from("fin_item").delete().eq("id", itemId).select("id");
  if (delErr) throw dbError("Removing the connection", delErr);
  if (!gone?.length) throw new Error("Only the person who connected this bank can remove it.");
  return warning;
}

