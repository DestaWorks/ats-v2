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
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
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
