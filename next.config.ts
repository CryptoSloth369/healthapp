import type { NextConfig } from "next";

// Cache Components is off: every page in this app is per-user and
// authenticated, so there is no shared static shell worth prerendering.
const nextConfig: NextConfig = {
  experimental: {
    // Meal photos are resized to ~1280px JPEG on the phone (usually < 500 KB),
    // but leave headroom; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
    // Detect lost connectivity and retry pending saves/navigations on reconnect.
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Always fetch the latest service worker.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
