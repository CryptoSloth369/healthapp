import Link from "next/link";

/** The "Coach" pill in screen headers. `small` matches the Money screen's Sync button. */
export function CoachLink({ small = false }: { small?: boolean }) {
  return (
    <Link
      href="/coach"
      className={`flex items-center rounded-full border border-accent/60 font-medium text-accent ${small ? "gap-1 px-2.5 py-1 text-xs" : "gap-1.5 px-3 py-1.5 text-sm"}`}
      aria-label="AI coach"
    >
      <svg viewBox="0 0 24 24" className={small ? "h-3.5 w-3.5" : "h-4 w-4"} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3zM19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8L19 15z" />
      </svg>
      Coach
    </Link>
  );
}
