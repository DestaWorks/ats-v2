import type { Capability } from "./constants/roles";
import type { Module } from "./constants/modules";
import type { CapabilityHolder } from "./constants/roles";

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
  /**
   * The role's NAME, for display and the audit trail — never what anything authorizes on. Two
   * workspaces can both have a "Director" that grants different things. A plain string, because
   * a tenant may invent its own names.
   */
  readonly role: string;
  /**
   * The authorization input, resolved once per request from the tenant's role row. Never cached
   * beyond one request, or a revoked permission outlives its revocation.
   */
  readonly capabilities: readonly Capability[];
  /** What the TENANT bought, as against what this PERSON may do. A gate needs both to pass. */
  readonly modules: readonly Module[];
}

/**
 * The minimum a capability decision needs — a resolved capability set.
 *
 * Every `TenantContext` is one, so a gate written against this takes the request's context
 * directly. It stays structural, and narrower than the context, so the pure PII-gating and
 * note-visibility functions can be exercised with a capability list and nothing else, and so a
 * viewer who is not a tenant member (a client-portal contact) can be admitted by widening one type
 * rather than every signature that gates on a capability.
 */
export type CapabilityViewer = CapabilityHolder;

/** The minimum an ENTITLEMENT decision needs. Every `TenantContext` is one. */
export interface ModuleViewer {
  readonly modules: readonly Module[];
}
