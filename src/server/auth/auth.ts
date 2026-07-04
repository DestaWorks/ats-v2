import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/server/db/prisma";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Google sign-in is wired only when both credentials are present. */
export const googleEnabled = Boolean(googleClientId && googleClientSecret);

/**
 * Better Auth server instance (DECISIONS D3).
 * - Email/password enabled; **public self-registration disabled** — accounts come from an
 *   invite / approved access request (or the seed). Google added when configured.
 * - `role` is a server-controlled field on the user (`input: false` → clients can't set it);
 *   our own capability model (`lib/constants` + `server/auth/guards`) governs feature access.
 * - The Better Auth **admin** plugin (user management / ban) is added in Wave 5 (Admin module),
 *   where its access-control roles are configured.
 * - `nextCookies()` must be the LAST plugin (lets Server Actions set auth cookies).
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
          },
        },
      }
    : {}),
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "Associate", input: false },
    },
  },
  // Brute-force hardening: Better Auth's built-in limiter. Its default in-memory store is
  // per-instance/best-effort (production should back it with the DB/secondary storage), but sign-in
  // is the top brute-force surface so we tighten it here. Better Auth activates rate limiting in
  // production by default; `enabled: true` also turns it on for staging. The email/password sign-in
  // path (`/sign-in/email`) gets a strict custom rule; other endpoints use the sane global default.
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 100, // global default per window
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
    },
  },
  // Dev only: trust localhost on whatever port `next dev` picks. In production the real
  // origin (BETTER_AUTH_URL = zyx.com / staging.zyx.com) is trusted automatically.
  ...(process.env.NODE_ENV !== "production"
    ? {
        trustedOrigins: [
          "http://localhost:3000",
          "http://localhost:3001",
          "http://localhost:3002",
          "http://localhost:3003",
        ],
      }
    : {}),
  plugins: [nextCookies()],
});
