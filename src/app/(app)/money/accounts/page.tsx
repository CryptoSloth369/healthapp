import { getMoney } from "@/lib/money-data";
import { AccountsView } from "./accounts-view";

export default async function AccountsPage() {
  const { accounts, items } = await getMoney();
  return <AccountsView accounts={accounts} items={items} now={new Date().toISOString()} />;
}
