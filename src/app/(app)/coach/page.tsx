import Link from "next/link";
import { listConversations } from "@/lib/assistant/history";
import { formatDay } from "@/lib/dates";
import { card } from "@/components/ui";
import { Chat } from "./chat";

export const maxDuration = 300;

export default async function CoachPage() {
  const conversations = await listConversations();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">Coach</h1>
        <p className="text-sm text-muted">AI analysis and planning from your own logs. Not medical advice.</p>
      </header>
      <Chat conversationId={null} initial={[]} />
      {conversations.length > 0 && (
        <section className={card}>
          <h2 className="mb-1 font-semibold">Past conversations</h2>
          <ul className="divide-y divide-border">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/coach/${c.id}`} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="truncate">{c.title}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDay(c.updated_at.slice(0, 10), { month: "short", day: "numeric" })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
