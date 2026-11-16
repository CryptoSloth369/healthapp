/** Supabase errors as returned by supabase-js. */
export type DbError = { message: string; code?: string; details?: string | null; hint?: string | null };

/** A thrown error that says which step failed and everything Supabase reported. */
export function dbError(step: string, e: DbError) {
  return new Error([`${step}: ${e.message}`, e.code && `code ${e.code}`, e.details, e.hint].filter(Boolean).join(" · "));
}

/** Supabase returns at most 1,000 rows per request; read everything in pages. */
const PAGE = 1000;
export async function readAll<T>(
  step: string,
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: DbError | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw dbError(step, error);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

export const chunks = <T>(xs: T[], size: number) =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, (i + 1) * size));
