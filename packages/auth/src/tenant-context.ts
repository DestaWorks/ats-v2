import {
  membershipReader,
  type ResolverMembershipRow as MembershipRow,
} from "@destaworks/db/memberships";
import { setLogContext } from "@destaworks/config/logger/request-context";
import { isRole, type Role } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";
import { AppError } from "@destaworks/integrations/http/app-error";
import type { AuthUser } from "./guards";
import type { TenantClaim } from "./tenant-claim";

/**
 * Turning a tenant CLAIM into a `TenantContext` (SAAS-RESTRUCTURE-PLAN 6.5).
 *
 * This is the only function in the codebase that produces a `TenantContext`, and it is the only
 * one that ever should be. `readTenantClaim` (./tenant-claim.ts) decides *which* tenant a request
 * named — from a path, a subdomain or a cookie, in that order — and every one of those sources
 * lands here, verified by the same query against the same table with the same rules. One
 * resolution path, not one per transport: a second path would eventually differ from the first,
 * and the difference would be an authorization bug nobody wrote on purpose.
 *
 * The rule the whole phase rests on: a tenant id from a header, cookie, path or subdomain is a
 * CLAIM, never proof. It becomes a context only after a row in `memberships` says this user is
 * `active` in that tenant. A claim that fails is refused outright — it never falls back to some
 * other tenant the user does happen to belong to. Falling back would be worse than a 403: the
 * request would succeed, in the wrong tenant, while the URL said otherwise.
 *
 * `role` is read from the MEMBERSHIP row, never from `User.role`. The same person may be Owner of
 * one tenant and Associate of another, so a capability derived from the user row would grant the
 * first tenant's powers inside the second.
 */

/** Why a claim was refused. Recorded in the log; deliberately NOT returned to the client, which
 *  sees one message for all four so a caller cannot probe for which tenants exist. */
export type TenantDenialReason =
  /** No membership row at all, or the tenant is deleted. Indistinguishable on purpose. */
  | "no-membership"
  /** Invited but never accepted — a pending invitation grants nothing until it is accepted. */
  | "invited"
  /** Access was revoked. Revocation takes effect on the next request, with no session to expire. */
  | "removed"
  /** The tenant itself is suspended; every member is refused until it is restored. */
  | "tenant-suspended";

/** One tenant the user may act in, or is invited to — what the switcher renders. No tenant data. */
export interface TenantChoice {
  readonly tenantId: string;
  readonly slug: string;
  readonly name: string;
  readonly role: Role;
  /** `active` (switchable) or `invited` (needs accepting first). Removed memberships are omitted. */
  readonly status: "active" | "invited";
}

export type TenantResolution =
  /**
   * `tenant` is the same row `context` was built from, projected for display. It rides along
   * because the caller that needs to name the workspace — the switcher's response, a log line —
   * would otherwise re-query for a slug the resolution already had in hand.
   */
  | { readonly outcome: "resolved"; readonly context: TenantContext; readonly tenant: TenantChoice }
  | {
      readonly outcome: "denied";
      readonly claim: TenantClaim;
      readonly reason: TenantDenialReason;
    }
  /** No claim, and the user is active in more than one tenant — they have to choose. */
  | { readonly outcome: "ambiguous"; readonly choices: readonly TenantChoice[] }
  /** No claim, and no tenant to fall back to. */
  | { readonly outcome: "none" };

/**
 * The role a membership grants, narrowed to the fixed enum.
 *
 * An unrecognised value collapses to the least privileged role rather than throwing — identical to
 * how `getCurrentUser` treats a session role. A row written by a future migration, or by hand,
 * must never fail open, and refusing the request outright would take a whole tenant offline over
 * one bad string.
 */
function roleOf(row: MembershipRow): Role {
  return isRole(row.role) ? row.role : "Associate";
}

/**
 * A tenant that can be acted in at all: it exists, it is not deleted, it is not suspended.
 *
 * Exported because suspension has to bite on every way INTO a workspace, not just the membership
 * path — the client portal and the public request-access forms resolve a tenant by slug without
 * ever seeing a membership, and each one is its own door.
 */
export function tenantIsUsable(tenant: { status: string; deletedAt: Date | null }): boolean {
  return tenant.deletedAt === null && tenant.status !== "suspended";
}

function tenantIsLive(row: MembershipRow): boolean {
  return tenantIsUsable(row.tenant);
}

/** `active` membership in a live tenant — the only combination that grants anything. */
function grantsAccess(row: MembershipRow): boolean {
  return row.status === "active" && tenantIsLive(row);
}

function toContext(user: AuthUser, row: MembershipRow): TenantContext {
  return {
    tenantId: row.tenantId,
    membershipId: row.id,
    user: { id: user.id, email: user.email, name: user.name },
    role: roleOf(row),
  };
}

function toChoice(row: MembershipRow): TenantChoice {
  return {
    tenantId: row.tenantId,
    slug: row.tenant.slug,
    name: row.tenant.name,
    role: roleOf(row),
    status: row.status === "active" ? "active" : "invited",
  };
}

/** Why a present-but-insufficient membership was refused. */
function denialFor(row: MembershipRow): TenantDenialReason {
  if (!tenantIsLive(row)) {
    return row.tenant.deletedAt === null ? "tenant-suspended" : "no-membership";
  }
  return row.status === "invited" ? "invited" : "removed";
}

/**
 * Resolve the active tenant for a signed-in user.
 *
 * With a claim, exactly one membership is consulted: the one for the claimed slug. Without a
 * claim, a user with a single active membership is placed in it (there is nothing to choose), and
 * a user with several is asked to choose rather than being dropped into whichever row sorted
 * first — an implicit choice here is a mutation landing in a tenant the user did not pick.
 */
export async function resolveTenantContext(
  user: AuthUser,
  claim: TenantClaim | null,
): Promise<TenantResolution> {
  if (claim !== null) {
    const row = await membershipReader.findByUserAndSlug(user.id, claim.slug);
    if (row === null) return { outcome: "denied", claim, reason: "no-membership" };
    if (!grantsAccess(row)) return { outcome: "denied", claim, reason: denialFor(row) };
    return { outcome: "resolved", context: toContext(user, row), tenant: toChoice(row) };
  }

  const rows = await membershipReader.listAllForUser(user.id);
  const usable = rows.filter(grantsAccess);
  const only = usable[0];
  if (only !== undefined && usable.length === 1) {
    return { outcome: "resolved", context: toContext(user, only), tenant: toChoice(only) };
  }
  if (usable.length === 0) return { outcome: "none" };
  return { outcome: "ambiguous", choices: usable.map(toChoice) };
}

/**
 * The guard form: a `TenantContext` or a thrown `AppError`.
 *
 * Every denial renders the same message. A caller must not be able to tell "that tenant does not
 * exist" from "it exists and you are not in it" — the difference is a membership-enumeration
 * oracle, and the slug space is guessable by design.
 *
 * `ambiguous` is a 400, not a 403: the user is entitled to be somewhere, they just have not said
 * where. The client's job is to send them to the switcher, which is a different response from
 * "you may not".
 */
export async function requireTenantContext(
  user: AuthUser,
  claim: TenantClaim | null,
): Promise<TenantContext> {
  const resolution = await resolveTenantContext(user, claim);
  switch (resolution.outcome) {
    case "resolved":
      setLogContext({ tenantId: resolution.context.tenantId });
      return resolution.context;
    case "denied":
      throw new AppError("FORBIDDEN", "You don't have access to that workspace");
    case "ambiguous":
      throw new AppError("BAD_REQUEST", "Choose a workspace to continue");
    case "none":
      throw new AppError("FORBIDDEN", "You don't have access to that workspace");
  }
}

/**
 * Every tenant the user may switch into, plus their pending invitations.
 *
 * Removed memberships are filtered out here rather than in the query: the repository returns the
 * whole lifecycle because the invitation flow needs to see a removed row to revive it, and this
 * read is the one that decides what a person is shown.
 */
export async function listTenantChoices(userId: string): Promise<readonly TenantChoice[]> {
  const rows = await membershipReader.listAllForUser(userId);
  return rows.filter((row) => tenantIsLive(row) && row.status !== "removed").map(toChoice);
}
