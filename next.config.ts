import type { NextConfig } from "next";

// Cache Components is off: every page in this app is per-user and
// authenticated, so there is no shared static shell worth prerendering.
const nextConfig: NextConfig = {
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
