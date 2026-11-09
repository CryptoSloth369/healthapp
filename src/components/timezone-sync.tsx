"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Saves the phone's time zone in a cookie so the server knows which calendar
 * day "today" is. Refreshes once if it was missing or changed (e.g. travel).
 */
export function TimezoneSync() {
  const router = useRouter();
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const current = document.cookie.match(/(?:^|; )tz=([^;]*)/)?.[1];
    if (tz && decodeURIComponent(current ?? "") !== tz) {
      document.cookie = `tz=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    }
  }, [router]);
  return null;
}
