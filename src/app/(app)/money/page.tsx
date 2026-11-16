import { todayLocal } from "@/lib/today";
import { addDays } from "@/lib/dates";
import { getBalanceHistory, getMoney, syncMoney } from "@/lib/money-data";
import { OverviewView } from "./overview-view";

export default async function MoneyPage() {
  const today = await todayLocal();
  // Refresh connections older than a few hours. A failure shows on the page instead of breaking it.
  let syncError: string | null = null;
  try {
    const r = await syncMoney({ today });
    if (r.errors.length) syncError = r.errors.join(" · ");
  } catch (err) {
    console.error("money sync failed", err);
    syncError = (err as Error).message;
  }
  const [{ accounts, items }, history] = await Promise.all([getMoney(), getBalanceHistory(addDays(today, -365))]);
  return <OverviewView accounts={accounts} items={items} history={history} syncError={syncError} now={new Date().toISOString()} />;
}
