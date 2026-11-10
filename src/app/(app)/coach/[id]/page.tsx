import Link from "next/link";
import { notFound } from "next/navigation";
import { getConversation } from "@/lib/assistant/history";
import { Chat } from "../chat";
import { DeleteConversation } from "./delete-conversation";

export const maxDuration = 300;

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conv = await getConversation(Number(id));
  if (!conv) notFound();
  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Link href="/coach" className="text-sm text-muted">
            ← Coach
          </Link>
          <h1 className="truncate text-lg font-semibold">{conv.title}</h1>
        </div>
        <DeleteConversation id={conv.id} />
      </header>
      <Chat conversationId={conv.id} initial={conv.turns} />
    </div>
  );
}
