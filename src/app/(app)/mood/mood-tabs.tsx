import Link from "next/link";

/** Check-in / Journal switch at the top of the Mood tab. */
export function MoodTabs({ active }: { active: "checkin" | "journal" }) {
  const tab = (key: typeof active, href: string, text: string) => (
    <Link
      href={href}
      aria-current={active === key ? "page" : undefined}
      className={`flex-1 rounded-lg py-1.5 text-center text-sm font-medium ${
        active === key ? "bg-surface text-foreground shadow-sm" : "text-muted"
      }`}
    >
      {text}
    </Link>
  );
  return (
    <nav className="flex gap-1 rounded-xl border border-border bg-background p-1" aria-label="Mood sections">
      {tab("checkin", "/mood", "Check-in")}
      {tab("journal", "/mood/journal", "Journal")}
    </nav>
  );
}
