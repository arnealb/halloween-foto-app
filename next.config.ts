import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // The watermark's font is read from disk at runtime; make sure every
  // server function that may render a watermark ships it.
  outputFileTracingIncludes: {
    "/**": ["src/party-camera/assets/*.ttf"],
  },
  partialPrefetching: true,
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
