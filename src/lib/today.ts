import "server-only";
import { cookies } from "next/headers";

/** Cookie set by <TimezoneSync/> with the phone's IANA time zone. */
export const TZ_COOKIE = "tz";
const FALLBACK_TZ = "UTC";

export function isValidTimeZone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function userTimeZone(): Promise<string> {
  const tz = (await cookies()).get(TZ_COOKIE)?.value;
  return isValidTimeZone(tz) ? tz : FALLBACK_TZ;
}

/** Today's date ("YYYY-MM-DD") in the user's own time zone. */
export async function todayLocal(): Promise<string> {
  const tz = await userTimeZone();
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
