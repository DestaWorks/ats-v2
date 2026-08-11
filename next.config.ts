import type { NextConfig } from "next";

/**
 * Baseline security headers (SECURITY-AUDIT-APP.md M2/L6) — none of these existed before. CSP is
 * intentionally permissive on `script-src`/`style-src` ('unsafe-inline', no nonce infrastructure
 * yet): the app has zero `dangerouslySetInnerHTML` and zero external script/style tags (verified in
 * the audit), so the real value here is BLOCKING every origin except our own (attacker-hosted JS,
 * data exfil via `connect-src`, clickjacking via `frame-ancestors`) — not hardening against an XSS
 * this app doesn't have. `frame-ancestors 'none'` + `X-Frame-Options: DENY` both close the sign-in
 * clickjacking gap the audit flagged.
 *
 * `'unsafe-eval'` is added to `script-src` ONLY in development: `next dev`'s Fast Refresh/HMR
 * runtime patches modules via `eval()`, and without it the CSP throws an `EvalError` before React
 * can hydrate — every client component silently fails to attach its event handlers (e.g. a form's
 * `onSubmit` never runs, so clicking Submit falls back to a native browser GET). Production never
 * uses eval-based HMR, so prod stays strict with no `'unsafe-eval'`.
 */

/** Derives an allowed CSP origin from an env var holding a URL — never a hardcoded provider
 *  domain, so this stays correct across S3-compatible providers with zero code change (same
 *  posture as `server/integrations/storage.ts`). */
function originFromEnvUrl(envVar: string | undefined): string | null {
  if (!envVar) return null;
  try {
    return new URL(envVar).origin;
  } catch {
    return null;
  }
}

/** The object-storage PUBLIC origin (Wave 6) — permanent avatar URLs read straight from here. */
const STORAGE_PUBLIC_ORIGIN = originFromEnvUrl(process.env.S3_PUBLIC_URL_BASE);
/** The object-storage S3-PROTOCOL origin (Wave 6) — signed upload/download URLs (résumés) live on
 *  a DIFFERENT subdomain than the public origin above (e.g. Supabase splits `storage.supabase.co`
 *  from `supabase.co`), so both need to be allowed independently. */
const STORAGE_S3_ORIGIN = originFromEnvUrl(process.env.S3_ENDPOINT);

const IMG_SRC = ["'self'", "data:", STORAGE_PUBLIC_ORIGIN].filter(Boolean).join(" ");
// connect-src: the browser PUTs résumé bytes directly to the signed S3 URL (never through our own
// server) — without this, `fetch()` to that origin is blocked outright, silently, before the
// request is even sent (indistinguishable from a network error in a bare try/catch).
const CONNECT_SRC = ["'self'", STORAGE_S3_ORIGIN].filter(Boolean).join(" ");
// frame-src: the résumé Preview modal embeds the signed GET URL in an <iframe>.
const FRAME_SRC = ["'self'", STORAGE_S3_ORIGIN].filter(Boolean).join(" ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      `img-src ${IMG_SRC}`,
      "font-src 'self'",
      `connect-src ${CONNECT_SRC}`,
      `frame-src ${FRAME_SRC}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // L6 — don't fingerprint the stack via X-Powered-By
  // Legacy `index.html` lives at the repo root for reference during the migration;
  // it is not part of the Next.js build (App Router serves from `src/app`).
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
