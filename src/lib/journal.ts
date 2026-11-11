/** Journal helpers. Pure functions; no I/O. */

export const JOURNAL_MAX_CHARS = 20000;

/** Trim, normalize line endings, collapse runs of blank lines, cap the length. */
export function normalizeBody(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, JOURNAL_MAX_CHARS);
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * Join speech-recognition result segments into one transcript.
 * Some browsers (iOS Safari) repeat earlier text in later segments, so a
 * segment that extends what we have replaces it, and one we already have is skipped.
 */
export function joinSegments(segments: string[]): string {
  let acc = "";
  for (const raw of segments) {
    const s = raw.trim();
    if (!s) continue;
    if (!acc || s.toLowerCase().startsWith(acc.toLowerCase())) acc = s;
    else if (acc.toLowerCase().endsWith(s.toLowerCase())) continue;
    else acc = `${acc} ${s}`;
  }
  return acc;
}

/** Add dictated text after what's already written, with sensible spacing and capitals. */
export function appendDictation(base: string, transcript: string): string {
  const t = transcript.trim();
  if (!t) return base;
  const trimmed = base.replace(/\s+$/, "");
  const newSentence = trimmed === "" || /[.!?]$/.test(trimmed) || /\n\s*$/.test(base);
  const text = newSentence ? t[0].toUpperCase() + t.slice(1) : t;
  if (base === "") return text;
  if (/\s$/.test(base)) return base + text;
  return `${base} ${text}`;
}

/** First ~n characters, cut at a word boundary. */
export function excerpt(body: string, n = 280): { text: string; cut: boolean } {
  if (body.length <= n) return { text: body, cut: false };
  const slice = body.slice(0, n);
  const space = slice.lastIndexOf(" ");
  return { text: `${(space > n * 0.6 ? slice.slice(0, space) : slice).trimEnd()}…`, cut: true };
}

/**
 * Given up to pageSize + 1 entries (newest first), return a page that doesn't
 * split a day, plus the day to continue from (inclusive) for the next page.
 */
export function pageByDay<T extends { written_on: string }>(fetched: T[], pageSize: number): { items: T[]; olderFrom: string | null } {
  if (fetched.length <= pageSize) return { items: fetched, olderFrom: null };
  const cutDay = fetched[pageSize].written_on;
  const whole = fetched.slice(0, pageSize).filter((e) => e.written_on > cutDay);
  if (whole.length > 0) return { items: whole, olderFrom: cutDay };
  // One day has more entries than a page: show what fits and move past that day.
  const prev = new Date(`${cutDay}T12:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return { items: fetched.slice(0, pageSize), olderFrom: prev.toISOString().slice(0, 10) };
}

/** Group entries (newest first) by day, keeping order. */
export function groupByDay<T extends { written_on: string }>(entries: T[]): { day: string; entries: T[] }[] {
  const out: { day: string; entries: T[] }[] = [];
  for (const e of entries) {
    const last = out.at(-1);
    if (last?.day === e.written_on) last.entries.push(e);
    else out.push({ day: e.written_on, entries: [e] });
  }
  return out;
}
