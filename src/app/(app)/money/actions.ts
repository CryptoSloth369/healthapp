"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/today";
import { ensureHouseholdId } from "@/lib/family-data";
import { connectItem, itemAccessToken, removeConnection, syncMoney } from "@/lib/money-data";
import { createLinkToken, type ConnectionType } from "@/lib/plaid";
import { MANUAL_KINDS, parseMoney } from "@/lib/finance";

type Result = { error?: string; warning?: string };
const fail = (err: unknown): Result => ({ error: (err as Error).message });
const refresh = () => revalidatePath("/money", "layout");

const Type = z.enum(["bank", "investments", "loans"]);
const Id = z.string().uuid();

/** A Plaid Link token: for a new connection of `type`, or to reconnect `itemId`. */
export async function getLinkToken(input: { type?: ConnectionType; itemId?: string }): Promise<{ token?: string; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  try {
    if (input.itemId) return { token: await createLinkToken({ userId, accessToken: await itemAccessToken(Id.parse(input.itemId)) }) };
    return { token: await createLinkToken({ userId, type: Type.parse(input.type) }) };
  } catch (err) {
    return fail(err);
  }
}

const Finish = z.object({
  publicToken: z.string().min(1).max(200),
  institutionId: z.string().max(100).nullable(),
  institutionName: z.string().max(200).nullable(),
  type: Type,
});

/** Plaid Link succeeded: save the connection and its accounts. */
export async function finishLink(input: z.infer<typeof Finish>): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  try {
    await connectItem({ ...Finish.parse(input), today: await todayLocal() });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return {};
}

/** Sync button (and after reconnecting). */
export async function syncNow(): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  try {
    const r = await syncMoney({ today: await todayLocal(), force: true });
    refresh();
    return r.errors.length ? { warning: r.errors.join(" · ") } : {};
  } catch (err) {
    return fail(err);
  }
}

export async function disconnect(itemId: string): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  try {
    const warning = await removeConnection(Id.parse(itemId));
    refresh();
    return warning ? { warning } : {};
  } catch (err) {
    return fail(err);
  }
}

const Kind = z.enum(MANUAL_KINDS as [string, ...string[]]);

export async function addManualAccount(_prev: Result, form: FormData): Promise<Result & { savedAt?: number }> {
  if (!(await getUserId())) return { error: "You are signed out." };
  const name = String(form.get("name") ?? "").trim();
  const kind = Kind.safeParse(form.get("kind"));
  const balance = parseMoney(String(form.get("balance") ?? ""));
  if (!name || name.length > 80) return { error: "Give it a name (up to 80 characters)." };
  if (!kind.success) return { error: "Pick a type." };
  if (balance == null || Math.abs(balance) > 1e11) return { error: "Enter the value in dollars, like 25000 or 1,250.50." };
  const supabase = await createClient();
  const householdId = await ensureHouseholdId();
  const { data, error } = await supabase
    .from("fin_account")
    .insert({ household_id: householdId, name, kind: kind.data, balance, is_manual: true, shared: form.get("shared") === "on" })
    .select("id")
    .single<{ id: string }>();
  if (error) return { error: error.message };
  await supabase.from("fin_balance").upsert({ account_id: data.id, day: await todayLocal(), balance }, { onConflict: "account_id,day" });
  refresh();
  return { savedAt: Date.now() };
}

const Update = z
  .object({
    display_name: z.string().trim().max(80).nullable(),
    shared: z.boolean(),
    hidden: z.boolean(),
    kind: Kind,
    balance: z.number().finite().max(1e11).min(-1e11),
  })
  .partial();

/** Rename, share/unshare, hide, re-classify, or (manual accounts) set the balance. Your own accounts only. */
export async function updateAccount(id: string, patch: z.infer<typeof Update>): Promise<Result> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  const p = Update.safeParse(patch);
  if (!p.success || !Id.safeParse(id).success) return { error: "That change isn't valid." };
  const supabase = await createClient();
  const change: Record<string, unknown> = { ...p.data };
  if (change.display_name === "") change.display_name = null;
  if (p.data.balance != null) change.balance_updated_at = new Date().toISOString();
  // Only the owner edits settings; a balance edit is only for manual accounts.
  let q = supabase.from("fin_account").update(change).eq("id", id).eq("owner_user_id", userId);
  if (p.data.balance != null) q = q.eq("is_manual", true);
  const { data, error } = await q.select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can only change your own accounts." };
  if (p.data.balance != null)
    await supabase.from("fin_balance").upsert({ account_id: id, day: await todayLocal(), balance: p.data.balance }, { onConflict: "account_id,day" });
  refresh();
  return {};
}

export async function deleteManualAccount(id: string): Promise<Result> {
  const userId = await getUserId();
  if (!userId) return { error: "You are signed out." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("fin_account").delete().eq("id", Id.parse(id)).eq("is_manual", true).eq("owner_user_id", userId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "You can only delete your own manual accounts." };
  refresh();
  return {};
}
