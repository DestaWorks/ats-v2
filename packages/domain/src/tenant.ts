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

/**
 * The minimum a capability decision needs — a role, which is always a role *in a tenant*.
 *
 * Every `TenantContext` is one, so a gate written against this takes the request's context
 * directly. It stays structural, and narrower than the context, so the pure PII-gating and
 * note-visibility functions can be exercised with a role and nothing else, and so a future
 * viewer that is not a tenant member (a client-portal contact) can be admitted by widening one
 * type rather than every signature that gates on a capability.
 */
export interface CapabilityViewer {
  readonly role: Role;
}
