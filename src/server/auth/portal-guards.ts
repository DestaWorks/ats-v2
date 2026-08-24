import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { PORTAL_TOKEN_COOKIE } from "@/lib/constants";
import { AppError } from "@/server/http/app-error";
import { clientPortalTokenRepository } from "@/server/repositories/client-portal-token.repository";

/**
 * Client Portal auth (Wave 4.3) — completely separate from `server/auth/guards.ts`. Never imports
 * Better Auth/session logic: an external client contact is not one of the 6 internal RBAC roles.
 *
 * Identity ALWAYS comes from the `portal_token` HttpOnly cookie, resolved server-side against
 * `ClientPortalToken` — never from anything the client sends in a request body/query string. This
 * is the fix for legacy's IDOR (`portal_data`/`portal_post_role` trusted a client-supplied email).
 */

export interface PortalContext {
  contactId: string;
  clientId: string;
  fullName: string;
  email: string | null;
}

/** SHA-256 hex digest — matches `client-portal.service.ts`'s token-generation hash. */
export function hashPortalToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Validate a raw token string (from either the cookie or the one-time `?token=` link) against
 * `ClientPortalToken`. This is the ONE place a raw token is ever accepted as input — everywhere
 * ELSE (every `/portal/*`/`/api/portal/*` request after the initial link click) resolves identity
 * from the already-verified cookie only, never a client-supplied value again. Returns the token's
 * real `expiresAt` alongside the resolved identity so callers that mint a cookie (`/portal/access`)
 * can set its `Max-Age` to the token's actual remaining lifetime, not a fresh full TTL — re-visiting
 * a near-expiry link must not silently extend access.
 */
async function resolveByRawToken(
  rawToken: string,
): Promise<{ contact: PortalContext; expiresAt: Date } | null> {
  const tokenRow = await clientPortalTokenRepository.findByHash(hashPortalToken(rawToken));
  if (!tokenRow) return null;
  if (tokenRow.revokedAt) return null;
  if (tokenRow.expiresAt.getTime() <= Date.now()) return null;
  if (tokenRow.contact.deletedAt) return null;
  // A contact who left the client keeps a live 30-day cookie otherwise: `status: "left"` is the
  // only "this person is gone" signal the CRM offers short of deletion, and `portalEnabled` is
  // the explicit opt-in this token was minted under. Both are re-checked on EVERY request, so
  // revoking access is a CRM edit — it does not require also hunting down the token (audit
  // 2026-08-21).
  if (tokenRow.contact.status === "left") return null;
  if (!tokenRow.contact.portalEnabled) return null;

  await clientPortalTokenRepository.touchLastUsed(tokenRow.id);

  return {
    contact: {
      contactId: tokenRow.contact.id,
      clientId: tokenRow.contact.clientId,
      fullName: tokenRow.contact.fullName,
      email: tokenRow.contact.email,
    },
    expiresAt: tokenRow.expiresAt,
  };
}

/** Validate the one-time link's `?token=` value — used ONLY by `/portal/access` to mint the cookie. */
export function exchangePortalToken(
  rawToken: string,
): Promise<{ contact: PortalContext; expiresAt: Date } | null> {
  return resolveByRawToken(rawToken);
}

/** Resolve the current portal identity from the cookie, or `null` if absent/invalid/expired/revoked. */
export async function resolvePortalContact(): Promise<PortalContext | null> {
  const jar = await cookies();
  const raw = jar.get(PORTAL_TOKEN_COOKIE)?.value;
  if (!raw) return null;
  const result = await resolveByRawToken(raw);
  return result?.contact ?? null;
}

/** Require a valid portal identity (401 otherwise) — the ONLY entry point for portal auth. */
export async function requirePortalContact(): Promise<PortalContext> {
  const contact = await resolvePortalContact();
  if (!contact) throw new AppError("UNAUTHORIZED", "Portal link is invalid or has expired");
  return contact;
}
