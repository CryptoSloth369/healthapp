// Shared by the donut (client) and the category list (server), so it can't live in a "use client" file.
export type Slice = { key: string; label: string; total: number; count: number };

/** Slice color by rank; the folded "N more" slice is neutral. */
export const sliceColor = (s: Slice, i: number) => (s.key === "_rest" ? "var(--cat-rest)" : `var(--cat-${i + 1})`);
