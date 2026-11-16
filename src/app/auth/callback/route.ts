import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";

/**
 * Where Supabase's confirmation email sends people. Handles both the default
 * link (?code=…) and a custom template (?token_hash=…&type=…).
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const next = safeNext(p.get("next"), "/money/family");
  const supabase = await createClient();
  const code = p.get("code");
  const tokenHash = p.get("token_hash");
  const type = p.get("type") as EmailOtpType | null;
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing code") };
  if (error) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}`, request.url));
  return NextResponse.redirect(new URL(next, request.url));
}
