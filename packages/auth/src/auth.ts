import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins/admin";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { prisma } from "@destaworks/db/prisma";
import { sendEmail } from "@destaworks/integrations/email/provider";
import { resetPasswordEmail } from "@destaworks/integrations/email/templates/reset-password";

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/** Google sign-in is wired only when both credentials are present. */
export const googleEnabled = Boolean(googleClientId && googleClientSecret);

/**
 * Better Auth server instance (DECISIONS D3).
 * - Email/password enabled; **public self-registration disabled** — accounts come from an
 *   invite / approved access request (or the seed). Google added when configured.
 * - **This app declares no `role` field on the user.** Authority is the `Membership` in the active
 *   workspace, read by `getCurrentUser` (SAAS-RESTRUCTURE-PLAN 6.4) — one person can be Owner of
 *   one workspace and Associate of another, so an identity-level role would answer the wrong
 *   question in the second.
 * - The Better Auth **admin** plugin (Wave 5.3) provides user management (create/list/set-role/
 *   ban/unban/reset-password/remove) with server-hashed passwords and DB-enforced bans. It
 *   declares `user.role` in its OWN schema, writes it on every create, and gates each of its
 *   endpoints on `session.user.role`; that inner check is a SEPARATE authZ system from this app's
 *   `hasCapability`, and it is not the authoritative one — every `/api/admin/*` route gates with
 *   `requireCapability(...)` against the membership first, so the plugin's check can only refuse
 *   what we already allowed, never grant what we refused. The config below remaps the plugin's
 *   built-in role definitions (`adminAc`/`userAc`) onto our 6 role names so a legitimately
 *   authorized Owner/Admin is not ALSO rejected by it. Removing the remap 403s the whole
 *   account-management surface; see the plan's Phase 6.4 entry for what the column drop still needs.
 * - `nextCookies()` must be the LAST plugin (lets Server Actions set auth cookies).
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    // Forgot-password (2026-08-02): Better Auth owns token generation/expiry/verification and the
    // no-user-enumeration timing-safe response — this hook is only responsible for actually
    // sending the email, via our provider-agnostic `sendEmail` (server/email/provider.ts).
    sendResetPassword: async ({ user, url }) => {
      const { subject, html, text } = resetPasswordEmail({ name: user.name, url });
      await sendEmail({ to: user.email, subject, html, text });
    },
  },
  ...(googleEnabled
    ? {
        socialProviders: {
          google: {
            clientId: googleClientId as string,
            clientSecret: googleClientSecret as string,
            // Same invite-only policy as emailAndPassword above: block self-registration via
            // Google, not just sign-in for existing accounts (SECURITY-AUDIT-APP.md C1).
            disableSignUp: true,
          },
        },
      }
    : {}),
  // Trusts a signed cookie instead of hitting Postgres on every request. The cookie caches the
  // IDENTITY only — the role is re-read from the membership on every request by `getCurrentUser`,
  // so a role change takes effect immediately rather than after maxAge.
  session: {
    cookieCache: { enabled: true, maxAge: 60 },
  },
  // Brute-force hardening: Better Auth's built-in limiter. Its default in-memory store is
  // per-instance/best-effort (production should back it with the DB/secondary storage), but sign-in
  // is the top brute-force surface so we tighten it here. Better Auth activates rate limiting in
  // production by default; `enabled: true` also turns it on for staging. The email/password sign-in
  // path (`/sign-in/email`) gets a strict custom rule; other endpoints use the sane global default.
  // `/request-password-reset` (2026-08-08) gets the same strict rule as sign-in — it's an equally
  // sensitive unauthenticated endpoint, and now that `/forgot-password` is a dedicated, directly
  // navigable route (rather than buried behind the sign-in form), it needs the same abuse ceiling
  // or it's reachable at 20x the volume for email-bombing / account-existence probing.
  rateLimit: {
    enabled: true,
    window: 60, // seconds
    max: 100, // global default per window
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
      "/request-password-reset": { window: 60, max: 5 },
    },
  },
  // Dev only: trust localhost on whatever port `next dev` picks. A wildcard port, not a fixed
  // list — this machine runs several other local dev servers (other projects), so `next dev`
  // frequently lands outside any small hardcoded range (e.g. 3000/3001 already taken elsewhere),
  // and a signed-in-looking sign-in silently 403s with INVALID_ORIGIN. Confirmed via Better
  // Auth's own `trustedOrigins` wildcard support (`"http://localhost:*"` matches the origin
  // string, port included — verified directly against the installed package's
  // `wildcardMatch`/`matchesOriginPattern` source, not just the docs).
  ...(process.env.NODE_ENV !== "production" ? { trustedOrigins: ["http://localhost:*"] } : {}),
  plugins: [
    adminPlugin({
      adminRoles: ["Owner", "Admin"],
      defaultRole: "Associate",
      roles: {
        Owner: adminAc,
        Admin: adminAc,
        Director: userAc,
        Manager: userAc,
        Screener: userAc,
        Associate: userAc,
      },
    }),
    nextCookies(),
  ],
});
