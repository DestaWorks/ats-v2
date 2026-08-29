import { readTenantClaim } from "@destaworks/auth/tenant-claim";
import { tenantRepository } from "@destaworks/db/tenancy/membership.repository";
import type { TenantContext } from "@destaworks/domain/tenant";
import { systemContextFor } from "@destaworks/domain/system-context";

/**
 * Resolving a workspace for an UNAUTHENTICATED caller (the two public request-access forms).
 *
 * A claim off the URL is an assertion; this is the step that verifies the workspace exists and
 * hands back a scoping-only context to file the request against. It grants nothing.
 */
export const publicTenantService = {
  async contextForHost(host: string | undefined): Promise<TenantContext | null> {
    const claim = readTenantClaim({ host, cookie: undefined });
    if (!claim) return null;
    const tenant = await tenantRepository.findBySlug(claim.slug);
    return tenant ? systemContextFor(tenant.id) : null;
  },
};
