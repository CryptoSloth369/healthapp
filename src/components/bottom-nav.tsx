"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Tabs get added here as each feature is built.
const TABS = [
  { href: "/", label: "Today", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
  { href: "/food", label: "Food", icon: "M7 3v8a2 2 0 002 2v8M11 3v6M5 3v6a2 2 0 002 2M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4v9" },
  { href: "/weight", label: "Weight", icon: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  { href: "/profile", label: "Profile", icon: "M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0" },
];

export function BottomNav() {
  const path = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 border-t border-border bg-surface/90 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map((t) => {
          const active = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
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
