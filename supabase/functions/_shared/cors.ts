/**
 * Shared CORS & security headers for all Edge Functions.
 *
 * ALLOWED_ORIGINS restricts which domains can call the API.
 * Security headers (CSP, X-Frame-Options, etc.) are included in every response.
 */

const ALLOWED_ORIGINS = [
  "https://archipilot-delta.vercel.app",
  "https://archi-pilot.com",
  "https://www.archi-pilot.com",
];

// In development, also allow localhost
if (Deno.env.get("ENVIRONMENT") !== "production") {
  ALLOWED_ORIGINS.push("http://localhost:3000", "http://localhost:5173");
}

/** Determine the Access-Control-Allow-Origin value based on the request origin. */
function getAllowedOrigin(req: Request): string {
  const origin = req.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Default to the main app URL (won't match browser CORS for unknown origins)
  return ALLOWED_ORIGINS[0];
}

/** Security headers included in every response. */
function securityHeaders(): Record<string, string> {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

/** Build the full CORS + security headers for a given request. */
export function corsHeaders(req: Request): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
    ...securityHeaders(),
  };
}

/** Handle CORS preflight — return this early for OPTIONS requests. */
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  return null;
}

/** Build a JSON response with CORS + security headers. */
export function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}
