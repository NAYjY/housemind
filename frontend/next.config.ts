import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ── Images ────────────────────────────────────────────────────────────────
  images: {
    remotePatterns: [
      // S3 ap-southeast-1 — project images and product thumbnails
      {
        protocol: "https",
        hostname: "*.s3.ap-southeast-1.amazonaws.com",
      },
      // Pre-signed URL hostname (same region, different subdomain format)
      {
        protocol: "https",
        hostname: "s3.ap-southeast-1.amazonaws.com",
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
    ],
    // Disable Next.js image optimisation for pre-signed S3 URLs
    // (they are already optimised at upload time and re-signing would break)
    unoptimized: false,
    formats: ["image/avif", "image/webp"],
  },

  // ── i18n ──────────────────────────────────────────────────────────────────
  // Handled by next-intl middleware; Next.js i18n routing disabled to avoid conflicts
  // see middleware.ts for locale detection

  // ── Security headers (also set in vercel.json for edge) ──────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        ],
      },
    ];
  },

  // ── Compiler ──────────────────────────────────────────────────────────────
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },

  // ── Output ────────────────────────────────────────────────────────────────
  output: "standalone",

  // ── Experimental ─────────────────────────────────────────────────────────
  experimental: {
    typedRoutes: true,
    optimizePackageImports: ["@tanstack/react-query", "zustand"],
  },

  // ── Logging ───────────────────────────────────────────────────────────────
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === "development",
    },
  },
};

export default nextConfig;
