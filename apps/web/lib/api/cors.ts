/**
 * CORS headers for public API endpoints.
 *
 * Uses wildcard origin for broad API compatibility (e.g., QR code embeds,
 * third-party integrations). Endpoints that handle sensitive data should
 * use stricter origin validation at the route level.
 */
export const COMMON_CORS_HEADERS = new Headers({
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id",
  "Access-Control-Max-Age": "86400",
});

/**
 * Restricted CORS headers for sensitive endpoints.
 * Only allows requests from known origins.
 */
export function getRestrictedCorsHeaders(
  requestOrigin?: string | null,
): Headers {
  const allowedOrigins = [
    process.env.NEXTAUTH_URL,
    "https://app.dub.co",
    "https://dub.co",
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean) as string[];

  const origin =
    requestOrigin && allowedOrigins.includes(requestOrigin)
      ? requestOrigin
      : allowedOrigins[0] || "https://app.dub.co";

  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Request-Id",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });
}
