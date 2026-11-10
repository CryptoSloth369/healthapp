"use client";

import { useOffline } from "next/offline";

/** Shown while the connection is down; pending saves retry automatically. */
export function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div
      role="status"
      className="sticky top-0 z-20 bg-warn px-4 py-1.5 text-center text-sm font-medium text-black"
      style={{ paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
    >
      Offline. Anything you save will go through when you reconnect.
    </div>
  );
}
