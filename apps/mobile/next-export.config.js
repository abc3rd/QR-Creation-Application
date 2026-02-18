/**
 * Next.js config overlay for static export (Capacitor).
 *
 * Usage: Copy this into apps/web/next.config.js or merge it
 * when building the static export for the mobile app.
 *
 * The key setting is `output: 'export'` which generates a
 * static site in `apps/web/out/` that Capacitor can bundle.
 *
 * NOTE: Static export disables server-side features (API routes,
 * middleware, ISR). The mobile app should use the deployed API
 * for server-side operations.
 */
const baseConfig = require("../web/next.config.js");

module.exports = {
  ...baseConfig,
  output: "export",
  // Disable image optimization for static export
  images: {
    ...baseConfig.images,
    unoptimized: true,
  },
  // Static export cannot use i18n
  i18n: undefined,
  // Environment variables pointing to the live API
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "https://syncloudconnect.com",
    NEXT_PUBLIC_IS_MOBILE: "true",
  },
};
