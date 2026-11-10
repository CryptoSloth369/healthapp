import type { NextConfig } from "next";

// Cache Components is off: every page in this app is per-user and
// authenticated, so there is no shared static shell worth prerendering.
const nextConfig: NextConfig = {
  experimental: {
    // Meal photos are resized to ~1280px JPEG on the phone (usually < 500 KB),
    // but leave headroom; Vercel caps request bodies at 4.5 MB.
    serverActions: { bodySizeLimit: "4mb" },
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
