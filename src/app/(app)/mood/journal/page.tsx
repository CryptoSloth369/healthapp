import { JournalScreen, type JournalSearchParams } from "./journal-screen";

export default function JournalPage({ searchParams }: { searchParams: Promise<JournalSearchParams> }) {
  return <JournalScreen kind="journal" searchParams={searchParams} />;
}
