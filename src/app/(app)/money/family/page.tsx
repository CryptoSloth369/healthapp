import { getFamily } from "@/lib/family-data";
import { FamilyView } from "./family-view";

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ welcome?: string; joined?: string }> }) {
  const [{ welcome, joined }, family] = await Promise.all([searchParams, getFamily()]);
  return <FamilyView family={family} welcome={welcome} joined={joined} />;
}
