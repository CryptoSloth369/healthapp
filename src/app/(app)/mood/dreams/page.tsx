import { JournalScreen, type JournalSearchParams } from "../journal/journal-screen";

export default function DreamsPage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  return <JournalScreen kind="dream" searchParams={searchParams} />;
}
