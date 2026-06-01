import type { NextConfig } from 'next';

/**
 * QA Tools UI — Next.js configuration.
 *
 * Deployed as a static export to Cloudflare Pages.
 * All data fetching is client-side (API calls to qa-tools-worker).
 *
 * See: docs/architecture/QA_TOOLS_ARCHITECTURE.md §2.2
 */
const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  // Disable Next.js image optimization — not available in static exports.
  images: { unoptimized: true },
  // ESLint is run separately via `npm run lint`; skip during builds.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
