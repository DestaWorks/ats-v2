import { cache } from "react";
import { auth } from "./auth";
import { requestContext } from "@destaworks/config/request-context";
import { AppError } from "@destaworks/integrations/http/app-error";
import { hasCapability, type Capability } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";
import { setLogContext } from "@destaworks/config/logger/request-context";
import { resolveTenantContext } from "./tenant-context";
import { readTenantClaim } from "./tenant-claim";
import { TENANT_COOKIE } from "@destaworks/domain/constants/tenancy";

/**
 * The signed-in human — identity ONLY.
 *
 * `role` used to live here, read from the user row. It does not any more (SAAS-RESTRUCTURE-PLAN
 * 6.0): one person may be Owner of one tenant and Associate of another, so a role held on the
 * identity would grant the wrong thing in the second tenant. Removing the field is what makes
 * that a compile error rather than a silent privilege escalation — a capability check needs an
 * `AuthContext`, and an `AuthContext` can only come from a guard that resolved a tenant.
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

/**
 * What every guard returns: the request's `TenantContext`, with the identity widened to the
 * `AuthUser` the app renders (the domain type asks only for id/email/name, since `domain` must
 * not know what an avatar is).
 */
export interface AuthContext extends TenantContext {
  readonly user: AuthUser;
}

/**
 * Read the current session and resolve the tenant it acts in (or null). Never trusts the client
 * for identity or for role — both are read server-side, role from the `Membership` row.
 *
 * Null means "no usable context": either there is no session, or the session belongs to a user
 * with no membership in the requested tenant. Both fail closed; `resolveTenantContext` logs which
 * one it was.
 *
 * `cache()`-wrapped (perf audit 2026-08-04): every page calls this at least twice per request
 * (once in the root layout, again in the page itself, by design — "an additional guard, not a
 * replacement"), and every gated API route calls it via `requireUser`/`requireCapability`. None
 * of that was memoized, so each of those was a full, separate session-lookup DB round trip.
 * `cache()` de-dupes by request (Next.js's own documented pattern for exactly this function
 * shape — no args, and neither "who's signed in" nor "which tenant" can legitimately change
 * mid-request), scoped automatically per-request by Next.js's request context — never leaks
 * across different users' requests. It now covers the membership lookup too, so resolving a
 * tenant costs one extra query per request rather than one per guard call.
 */
/**
 * The signed-in identity, with NO tenant resolved.
 *
 * Separate from `getCurrentUser` because the platform plane needs exactly this and nothing more:
 * a platform admin may belong to no tenant at all, so resolving one would refuse the operator the
 * plane exists for. It grants nothing — an identity reaches no repository and no capability check.
 */
export const getSignedInIdentity = cache(async (): Promise<AuthUser | null> => {
  const session = await auth.api.getSession({ headers: await requestContext().headers() });
  if (!session) return null;
  setLogContext({ userId: session.user.id });
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  };
});

/** A signed-in identity, tenant or not (401 otherwise). The platform plane's authentication. */
export async function requireSignedInIdentity(): Promise<AuthUser> {
  const identity = await getSignedInIdentity();
  if (!identity) throw new AppError("UNAUTHORIZED", "Sign in required");
  return identity;
}

export const getCurrentUser = cache(async (): Promise<AuthContext | null> => {
  const identity = await getSignedInIdentity();
  if (!identity) return null;
  // The claim is read from the request the same way for both stacks (6.5 owns precedence:
  // path > subdomain > cookie). It is only ever a claim — `resolveTenantContext` is what checks it
  // against an active membership, and a claim naming a tenant the user does not belong to resolves
  // to nothing rather than falling back to one they do.
  const headers = await requestContext().headers();
  const claim = readTenantClaim({
    host: headers.get("host") ?? undefined,
    path: headers.get("x-invoke-path") ?? headers.get("x-pathname") ?? undefined,
    cookie: (await requestContext().cookie(TENANT_COOKIE)) ?? undefined,
  });

  const resolution = await resolveTenantContext(identity, claim);
  if (resolution.outcome !== "resolved") return null;

  // The resolver narrows the identity to `TenantContext`'s three fields. `AuthContext` carries the
  // whole `AuthUser`, so the identity is reattached here rather than widened there — the resolver
  // has no business deciding which identity fields a caller may see.
  return { ...resolution.context, user: identity };
});

/** Require a signed-in user acting in a tenant (401 otherwise). */
export async function requireUser(): Promise<AuthContext> {
  const context = await getCurrentUser();
  if (!context) throw new AppError("UNAUTHORIZED", "Sign in required");
  return context;
}

/** For `(app)` pages/loaders — `layout.tsx` already guards the whole group, so this is a
 *  non-null narrowing, not a second check. Throws if that invariant is ever violated. */
export async function getVerifiedUser(): Promise<AuthContext> {
  const context = await getCurrentUser();
  if (!context) {
    throw new Error("getVerifiedUser() called outside the (app) layout's auth guard");
  }
  return context;
}

/**
 * Require a specific capability (403 otherwise) — the primary authZ guard.
 * "Leadership"/"admin" gates are capabilities, never hardcoded role lists (DECISIONS D3).
 *
 * The role it resolves against is `context.role`, from the membership in the ACTIVE tenant. That
 * is the substantive change in 6.4: the same person asking the same question in a second tenant
 * gets that tenant's answer.
 */
export async function requireCapability(capability: Capability): Promise<AuthContext> {
  const context = await requireUser();
  if (!hasCapability(context.role, capability)) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
  return context;
}
