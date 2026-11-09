// Only the origin is used, so a URL pasted with a path (e.g. ".../rest/v1/")
// still works.
export const SUPABASE_URL = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
