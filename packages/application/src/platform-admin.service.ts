import { writeAudit } from "@destaworks/db/audit";
import {
  membershipRepository,
  tenantRepository,
  type MembershipTenantRow,
} from "@destaworks/db/tenancy/membership.repository";
import { withTransaction } from "@destaworks/db/with-transaction";
import type { PlatformContext } from "@destaworks/domain/platform";
import type { AuthUser } from "@destaworks/auth/guards";
import { requirePlatformCapability } from "@destaworks/auth/platform-admin";
import { AppError } from "@destaworks/integrations/http/app-error";
import type {
  GetPlatformTenantResponse,
  GetPlatformTenantsResponse,
  PlatformTenantDTO,
} from "@destaworks/contracts/validation/tenant";

/**
 * The platform plane's operations (SAAS-RESTRUCTURE-PLAN 6.8).
 *
 * Everything here runs on the platform axis, and nothing here takes a `TenantContext`. That is not
 * a convention — it is the type-level statement of the phase's done-when. A tenant Owner cannot
 * call any of these, because calling them requires a `PlatformContext`, and the only thing that
 * mints one is a user id in deployment configuration (`@destaworks/auth/platform-admin`). No role
 * value produces one, so no role value reaches another tenant's data.
 *
 * ── What counts as a cross-tenant action, and what gets audited ────────────────────────────────
 *
 * `listTenants` reads the tenant REGISTRY — slug, name, status, how many members. That is the
 * platform's own record of its customers, not any customer's data, and it names no tenant to write
 * a row against. It is authorized (`viewTenants`) and it is logged, but it is not audited into a
 * tenant, because there is no tenant it happened to.
 *
 * `readTenant` is the other kind: it names one tenant and reaches into it. Every such call writes
 * an `activity_log` row INTO THAT TENANT — so the record of a platform admin looking at a
 * customer's workspace is visible to that customer's own auditors, not only to ours. That is the
 * property that makes the plane acceptable to have at all, and it is why the write and the read
 * share one transaction: an audited read cannot succeed with the audit rolled back.
 *
 * Audit rows carry IDS ONLY. The acting admin's email is on the `PlatformContext` and is
 * deliberately not written — the trail must survive being read by a wider audience than the people
 * who can see the account it names.
 */

function toDTO(tenant: MembershipTenantRow, memberCount: number): PlatformTenantDTO {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    memberCount,
  };
}

/**
 * Record one cross-tenant access, in the tenant it touched.
 *
 * `entityId` is the tenant id rather than the row's own id: an auditor filtering the trail for
 * "what happened to this workspace" finds the platform's visits alongside everything else, which
 * is where they are useful.
 */
function auditCrossTenantAccess(
  platform: PlatformContext,
  tenantId: string,
  detail: Readonly<Record<string, string>>,
): Promise<unknown> {
  return withTransaction((tx) =>
    writeAudit(tx, {
      entity: "tenant",
      entityId: tenantId,
      actor: platform.user.id,
      action: "platform_access",
      tenantId,
      after: { tenantId, ...detail },
    }),
  );
}

export const platformAdminService = {
  /** The tenant registry. Operational metadata only — never a tenant's contents. */
  async listTenants(user: AuthUser): Promise<GetPlatformTenantsResponse> {
    requirePlatformCapability(user, "viewTenants");
    const tenants = await tenantRepository.listAll();
    const counts = await membershipRepository.countActiveByTenantIds(tenants.map((t) => t.id));
    return { tenants: tenants.map((t) => toDTO(t, counts.get(t.id) ?? 0)) };
  },

  /**
   * Read one tenant, from outside it. The audited crossing.
   *
   * The audit row is written BEFORE the response is returned and in its own transaction, so a
   * failure to record the access fails the access. An unaudited cross-tenant read is precisely the
   * event this plane must not be able to produce.
   */
  async readTenant(user: AuthUser, slug: string): Promise<GetPlatformTenantResponse> {
    const platform = requirePlatformCapability(user, "readTenantData");

    const tenant = await tenantRepository.findBySlug(slug);
    if (tenant === null) throw new AppError("NOT_FOUND", "No such workspace");

    await auditCrossTenantAccess(platform, tenant.id, { scope: "tenant-metadata" });

    const counts = await membershipRepository.countActiveByTenantIds([tenant.id]);
    return { tenant: toDTO(tenant, counts.get(tenant.id) ?? 0) };
  },
};
