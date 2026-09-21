import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { prisma } from "@destaworks/db/prisma";
import { authTrustedOrigins } from "./trusted-origins";

/**
 * A SECOND Better Auth instance, for the platform console only.
 *
 * ── Why a second one at all ─────────────────────────────────────────────────────────────────────
 *
 * One instance means one cookie, which means one identity per browser. An operator debugging a
 * workspace therefore cannot also be an operator: signing into the app as a tenant Owner replaces
 * the console session, and the console answers "not a platform administrator" about the account
 * that just displaced it. The two planes need to be held at once, so they need separate cookies.
 *
 * It is also the narrower blast radius. Platform access reads across every tenant on the
 * installation; carrying that authority in the same cookie as an ordinary recruiter session makes
 * every XSS or token leak in the operator app a platform compromise as well.
 *
 * ── What makes them independent ─────────────────────────────────────────────────────────────────
 *
 * `cookiePrefix` changes the cookie NAME, and the absence of a domain keeps it HOST-ONLY: the
 * console's cookie is never sent to the operator app, and the operator app's is never sent here —
 * even though both are subdomains of one parent and the operator cookie is deliberately shared
 * across that parent (`COOKIE_DOMAIN`). Neither can stand in for the other.
 *
 * ── What is deliberately absent ─────────────────────────────────────────────────────────────────
 *
 * No social sign-in, no admin plugin, no password reset. This plane is a handful of operators who
 * are provisioned by deployment configuration, not a signup funnel; every extra route here is one
 * more unauthenticated surface in front of the data of every customer. Email and password only.
 *
 * Accounts and sessions are the SAME tables — the console is not a separate user directory. It
 * mints its own session row for the same `User`, and `PLATFORM_ADMIN_USER_IDS` still decides
 * whether that identity may do anything at all. Signing in here grants nothing by itself.
 */
export const platformAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  session: {
    cookieCache: { enabled: true, maxAge: 60 },
  },
  // Stricter than the operator app's five. The population is a handful of named operators, so a
  // legitimate user hits this only by mistyping repeatedly, while the endpoint guards every
  // tenant's data at once.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 3 },
    },
  },
  // Better Auth validates `Origin` on state-changing calls, and without a list it refuses the
  // console's own sign-in with a 403 — same installation-wide list as the operator app, since the
  // set of origins this deployment trusts is one fact, not two.
  trustedOrigins: authTrustedOrigins(),
  advanced: {
    // The whole point: a distinct name, and no `crossSubDomainCookies`, so this cookie stays on
    // the console's own host while the operator app's is shared across the parent domain.
    cookiePrefix: "desta-platform",
  },
  secret: process.env["BETTER_AUTH_SECRET"] ?? "",
  plugins: [nextCookies()],
});

/**
 * The console's auth route handler, built here so `apps/admin` needs no direct `better-auth`
 * dependency — and, more usefully, so the route cannot accidentally be wired to the operator app's
 * instance, which would issue the shared cookie and undo the separation.
 */
export const platformAuthHandler = toNextJsHandler(platformAuth);
