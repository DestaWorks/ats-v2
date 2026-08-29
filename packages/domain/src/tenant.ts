import type { Role } from "./constants/roles";

/**
 * Who is asking, and on whose behalf — resolved once per request by a guard and threaded down.
 *
 * `role` comes from the MEMBERSHIP, not the user. That is the whole reason this type exists rather
 * than passing a tenant id around: the same person may be Owner of one tenant and Associate of
 * another, so "what may they do" is only answerable together with "here". A capability check
 * against a role read from the user row would grant the wrong thing in the second tenant.
 *
 * It lives in `domain` because every layer names it — repositories, services, guards — and `domain`
 * is the dependency-free leaf they all already reach.
 */
export interface TenantContext {
  readonly tenantId: string;
  readonly membershipId: string;
  /** Identity only. Deliberately carries no role: that is a per-tenant fact, above. */
  readonly user: { readonly id: string; readonly email: string; readonly name: string };
  readonly role: Role;
}
