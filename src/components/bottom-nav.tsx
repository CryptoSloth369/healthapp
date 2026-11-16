"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const HEALTH_TABS: Tab[] = [
  { href: "/", label: "Today", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/food", label: "Food", icon: "M7 3v8a2 2 0 002 2v8M11 3v6M5 3v6a2 2 0 002 2M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9" },
  { href: "/exercise", label: "Exercise", icon: "M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" },
  { href: "/weight", label: "Weight", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/mood", label: "Mood", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" },
  { href: "/dashboard", label: "Trends", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
];

// Budget joins these in roadmap step 16.
const MONEY_TABS: Tab[] = [
  { href: "/money", label: "Overview", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { href: "/money/spending", label: "Spending", icon: "M12 3v9h9M21 12a9 9 0 11-9-9" },
  { href: "/money/accounts", label: "Accounts", icon: "M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18M12 3l9 5H3z" },
  { href: "/money/family", label: "Family", icon: "M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 0112 0v1M17 11a3 3 0 100-6M22 21v-1a5 5 0 00-4-4.9" },
];

/** Which area a path belongs to. Profile and coach count as Health. */
export function areaOf(path: string): "health" | "money" {
  return path === "/money" || path.startsWith("/money/") ? "money" : "health";
}

function isActive(href: string, path: string) {
  if (href === "/" || href === "/money") return path === href;
  return path === href || path.startsWith(href + "/");
}

export function BottomNav() {
  const path = usePathname();
  const tabs = areaOf(path) === "money" ? MONEY_TABS : HEALTH_TABS;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/90 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((t) => {
          const active = isActive(t.href, path);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs ${active ? "text-accent" : "text-muted"}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Health / Money switch at the top of every signed-in screen. */
export function AreaSwitch() {
  const area = areaOf(usePathname());
  const item = (key: "health" | "money", href: string, label: string) => (
    <Link
      href={href}
      aria-current={area === key ? "page" : undefined}
      className={`flex-1 rounded-md px-4 py-1 text-center text-sm ${area === key ? "bg-surface font-semibold text-foreground shadow-sm" : "text-muted"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Area" className="mx-auto flex w-full max-w-lg px-4 pt-3" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
      <div className="mx-auto flex w-56 rounded-lg border border-border bg-background p-0.5">
        {item("health", "/", "Health")}
        {item("money", "/money", "Money")}
      </div>
    </nav>
  );
}
