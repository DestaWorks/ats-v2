import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      // The platform API is reached from the SERVER (see src/lib/platform-api.ts), never from the
      // browser, so no cross-origin `connect-src` allowance is needed and none is granted.
      "connect-src 'self'",
      "frame-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `@destaworks/db` is listed although `apps/admin` may not import it: `@destaworks/auth` does,
  // and Next has to compile the whole reachable TypeScript graph. Being compilable is not an
  // edge in the dependency law — scripts/check-architecture.mjs reads import specifiers and
  // manifests, and admin declares neither.
  transpilePackages: [
    "@destaworks/auth",
    "@destaworks/config",
    "@destaworks/contracts",
    "@destaworks/db",
    "@destaworks/domain",
    "@destaworks/integrations",
    "@destaworks/ui",
  ],
  serverExternalPackages: ["pino", "pino-pretty"],
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
