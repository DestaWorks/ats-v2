import { LEAST_PRIVILEGED_ROLE } from "./constants/roles";
import type { TenantContext } from "./tenant";

/** The synthetic actor a background job runs as. Not a real user; never a member of anything. */
export const SYSTEM_ACTOR_ID = "system";

/**
 * A context for work that has a tenant but no human — a job handler, resumed from a queue.
 *
 * A job is enqueued by someone with a context and runs later without one, so the tenant travels in
 * the payload and this rebuilds enough of a context to SCOPE queries with. That is the entire
 * purpose: it exists so a handler can reach a repository, not so it can decide anything.
 *
 * It carries `LEAST_PRIVILEGED_ROLE` deliberately. A job that reached a capability check with this
 * context would be denied rather than granted, so the failure mode of misusing it is a job that
 * stops working — loud, and recoverable — instead of one that quietly acts with authority nobody
 * granted it. The capability decision belongs at the endpoint that enqueued the work, where a real
 * membership was present.
 *
 * Correspondingly, do NOT use this for work whose OUTPUT depends on the requester's capabilities.
 * The candidate CSV export is safe because its columns are the published ones and carry nothing
 * gated; a job that emitted `licenseNumber` would have to carry the requester's role instead.
 */
export function systemContextFor(tenantId: string): TenantContext {
  return {
    tenantId,
    membershipId: SYSTEM_ACTOR_ID,
    role: LEAST_PRIVILEGED_ROLE,
    user: { id: SYSTEM_ACTOR_ID, email: "", name: "system" },
  };
}

/**
 * The scope for a client-portal contact — outside the company, holding a token, not a membership.
 * Authorization is `requirePortalContact`'s job; this only lets their reads be scoped.
 */
export function portalScopeFor(tenantId: string, contactId: string): TenantContext {
  return {
    tenantId,
    membershipId: SYSTEM_ACTOR_ID,
    role: LEAST_PRIVILEGED_ROLE,
    user: { id: contactId, email: "", name: "portal-contact" },
  };
}
