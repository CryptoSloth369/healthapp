"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getUserId } from "@/lib/supabase/server";
import { ensureHouseholdId } from "@/lib/family-data";
import { isCategory, merchantKey } from "@/lib/spending";

type Result = { error?: string };
const Id = z.string().uuid();

/**
 * Change a transaction's category (empty = back to automatic). With
 * `alwaysForMerchant`, also save a family rule so past and future
 * transactions from the same merchant get it too.
 */
export async function setTransactionCategory(id: string, category: string, alwaysForMerchant: boolean): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  if (!Id.safeParse(id).success || (category !== "" && !isCategory(category))) return { error: "That category isn't valid." };
  const supabase = await createClient();
  const { data: txn, error } = await supabase
    .from("fin_transaction")
    .update({ category_override: category || null })
    .eq("id", id)
    .select("name, merchant_name")
    .single<{ name: string; merchant_name: string | null }>();
  if (error) return { error: error.message };
  if (alwaysForMerchant && category) {
    const match = merchantKey(txn).slice(0, 80);
    if (match.length >= 2) {
      const { error: e } = await supabase
        .from("fin_category_rule")
        .upsert({ household_id: await ensureHouseholdId(), match, category }, { onConflict: "household_id,match" });
      if (e) return { error: e.message };
    }
  }
  revalidatePath("/money/spending");
  return {};
}

export async function deleteRule(id: string): Promise<Result> {
  if (!(await getUserId())) return { error: "You are signed out." };
  if (!Id.safeParse(id).success) return { error: "Unknown rule." };
  const supabase = await createClient();
  const { error } = await supabase.from("fin_category_rule").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/money/spending");
  return {};
}
