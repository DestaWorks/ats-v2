/**
 * The PLATFORM axis (SAAS-RESTRUCTURE-PLAN 6.8) — who may act on the installation itself, as
 * opposed to who may act inside one tenant.
 *
 * The two axes are separate types on purpose, and neither can be derived from the other:
 *
 *   - `TenantContext` (`./tenant`) answers "what may this person do HERE", and its `role` comes
 *     from a `Membership`. Every value of that role — `Owner` included — is scoped to the one
 *     tenant the membership names. There is no role value that widens it, because widening is not
 *     something a role expresses.
 *   - `PlatformContext` (below) answers "what may this person do to the installation". It carries
 *     no `tenantId` and no `Role`, so it cannot be passed where a tenant-scoped query wants a
 *     context, and a `TenantContext` cannot be passed here.
 *
 * That is the whole security property of 6.8 stated in the type system: a tenant Owner reaching
 * another tenant's data would require producing a `PlatformContext`, and no amount of tenant role
 * grants one. Only `packages/auth/src/platform-admin.ts` mints one, from configuration the
 * application has no write path to.
 *
 * Lives in `domain` for the same reason `TenantContext` does: `application` and `auth` both name
 * it, and `domain` is the dependency-free leaf they already share.
 */

/**
 * What a platform admin may do. Deliberately coarse and deliberately short — this is not a second
 * copy of the tenant capability list, and it must never grow a per-feature entry. A platform admin
 * operates the platform; they do not do a recruiter's job in someone else's tenant.
 */
export const PLATFORM_CAPABILITIES = [
  /** Enumerate tenants and read their operational metadata (plan, status, seat counts). */
  "viewTenants",
  /** Act on a tenant's own record — suspend, restore, adjust plan or seat limit. */
  "administerTenants",
  /**
   * Read INSIDE a tenant, for support. The one capability that crosses the isolation boundary, so
   * it is the one every audit requirement in 6.8 is really about.
   */
  "readTenantData",
] as const;
export type PlatformCapability = (typeof PLATFORM_CAPABILITIES)[number];

/**
 * A verified platform administrator.
 *
 * `user` is identity only, exactly as on `TenantContext` — and for the same reason: an audit row
 * may record who acted, and nothing more of them than an id.
 */
export interface PlatformContext {
  readonly user: { readonly id: string; readonly email: string };
  readonly capabilities: readonly PlatformCapability[];
}

/** Whether a verified platform admin holds a capability. Pure; the guard does the verifying. */
export function hasPlatformCapability(
  context: PlatformContext,
  capability: PlatformCapability,
): boolean {
  return context.capabilities.includes(capability);
}
