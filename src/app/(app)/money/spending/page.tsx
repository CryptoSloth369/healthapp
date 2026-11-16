import { todayLocal } from "@/lib/today";
import { getSpending } from "@/lib/spending-data";
import { isMonth } from "@/lib/spending";
import { SpendingView } from "./spending-view";

export default async function SpendingPage({ searchParams }: { searchParams: Promise<{ month?: string; acct?: string; cat?: string }> }) {
  const [sp, today] = await Promise.all([searchParams, todayLocal()]);
  const month = isMonth(sp.month) && sp.month <= today.slice(0, 7) ? sp.month : today.slice(0, 7);
  const filter = sp.acct && sp.acct.length <= 40 ? sp.acct : "cards";
  const { accounts, txns, rules } = await getSpending(month, filter);
  return <SpendingView month={month} today={today} filter={filter} cat={sp.cat ?? null} accounts={accounts} txns={txns} rules={rules} />;
}
