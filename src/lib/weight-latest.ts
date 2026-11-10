import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getLatestWeightLb(): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("weight_entry")
    .select("weight_lb")
    .order("measured_on", { ascending: false })
    .limit(1)
    .maybeSingle<{ weight_lb: number }>();
  return data ? Number(data.weight_lb) : null;
}
