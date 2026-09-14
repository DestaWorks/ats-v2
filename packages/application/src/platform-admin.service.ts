import { writeAudit } from "@destaworks/db/audit";
import {
  membershipRepository,
  tenantRepository,
  type TenantRegistryRow,
} from "@destaworks/db/tenancy/membership.repository";
import { platformTenantRepository } from "@destaworks/db/tenancy/platform-tenant.repository";
import { withAnnouncedTenant } from "@destaworks/db/tenant-transaction";
import type { AnyTx } from "@destaworks/db/tenant-scope";
import type { PlatformContext } from "@destaworks/domain/platform";
import type { AuthUser } from "@destaworks/auth/guards";
import { requirePlatformCapability } from "@destaworks/auth/platform-admin";
import { AppError } from "@destaworks/integrations/http/app-error";
import type {
  GetPlatformTenantResponse,
  GetPlatformTenantsResponse,
  PlatformTenantDTO,
  PostPlatformTenantRestoreResponse,
  PostPlatformTenantSuspendResponse,
  SuspendTenantInput,
  TenantHealthDTO,
  TenantHealthSignal,
  TenantTrialDTO,
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
 * `listTenants` reads the tenant REGISTRY — slug, name, status, plan, how many members. That is
 * the platform's own record of its customers, not any customer's data, and it names no tenant to
 * write a row against. It is authorized (`viewTenants`) and it is logged, but it is not audited
 * into a tenant, because there is no tenant it happened to.
 *
 * `readTenant`, `suspendTenant` and `restoreTenant` are the other kind: each names one tenant and
 * reaches into it. Every such call writes an `activity_log` row INTO THAT TENANT — so the record
 * of a platform admin looking at, or switching off, a customer's workspace is visible to that
 * customer's own auditors, not only to ours. That is the property that makes the plane acceptable
 * to have at all, and it is why the write and the audit share one transaction: neither an audited
 * read nor a suspension can succeed with its record rolled back.
 *
 * Audit rows carry IDS AND CLOSED VOCABULARY ONLY. The acting admin's email is on the
 * `PlatformContext` and is deliberately not written, and a suspension's reason is an enum rather
 * than a sentence — the trail must survive being read by a wider audience than the people who can
 * see the account it names.
 */

/** A trial is "ending soon" a week out — long enough to act on, short enough to still mean it. */
const TRIAL_ENDING_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

function trialOf(tenant: TenantRegistryRow, now: Date): TenantTrialDTO | null {
  if (tenant.trialEndsAt === null) return null;
  const msRemaining = tenant.trialEndsAt.getTime() - now.getTime();
  const expired = msRemaining <= 0;
  return {
    endsAt: tenant.trialEndsAt.toISOString(),
    // An elapsed trial reports zero rather than a negative count: "-4 days remaining" is a number
    // a console would have to special-case anyway, and `expired` already carries that fact.
    daysRemaining: expired ? 0 : Math.ceil(msRemaining / DAY_MS),
    expired,
  };
}

/**
 * Is this tenant OK? — answered from the registry row and its active member count, nothing else.
 *
 * Deriving rather than storing is what keeps the tenant list at two queries no matter how many
 * customers there are. Nothing here reads inside a tenant, so nothing here can leak one.
 */
function healthOf(tenant: TenantRegistryRow, memberCount: number, now: Date): TenantHealthDTO {
  const limit = tenant.seatLimit;
  const seats = {
    used: memberCount,
    limit,
    overLimit: limit !== null && memberCount > limit,
  };
  const trial = trialOf(tenant, now);

  const critical: TenantHealthSignal[] = [];
  const warning: TenantHealthSignal[] = [];

  if (tenant.status === "suspended") critical.push("suspended");
  if (trial !== null && trial.expired) critical.push("trial-expired");
  // Nobody can sign in at all — a provisioned tenant whose first Owner never accepted looks
  // exactly like a healthy one in the registry, and is the single most common support ticket.
  if (memberCount === 0) critical.push("no-active-members");

  if (seats.overLimit) warning.push("over-seat-limit");
  else if (limit !== null && memberCount === limit) warning.push("at-seat-limit");
  if (trial !== null && !trial.expired && trial.daysRemaining <= TRIAL_ENDING_SOON_DAYS) {
    warning.push("trial-ending-soon");
  }

  return {
    level: critical.length > 0 ? "critical" : warning.length > 0 ? "warning" : "ok",
    signals: [...critical, ...warning],
    seats,
    trial,
  };
}

function toDTO(tenant: TenantRegistryRow, memberCount: number, now: Date): PlatformTenantDTO {
  return {
    id: tenant.id,
    slug: tenant.slug,
    name: tenant.name,
    status: tenant.status,
    plan: tenant.plan,
    memberCount,
    createdAt: tenant.createdAt.toISOString(),
    health: healthOf(tenant, memberCount, now),
  };
}

/**
 * Record one cross-tenant action, in the tenant it touched.
 *
 * Takes the caller's `tx` rather than opening its own so that the audit commits with whatever it
 * is recording. `entityId` is the tenant id rather than the row's own id: an auditor filtering the
 * trail for "what happened to this workspace" finds the platform's visits and suspensions
 * alongside everything else, which is where they are useful.
 */
function auditCrossTenantAction(
  tx: AnyTx,
  platform: PlatformContext,
  tenantId: string,
  action: string,
  detail: Readonly<Record<string, string>>,
): Promise<unknown> {
  return writeAudit(tx, {
    entity: "tenant",
    entityId: tenantId,
    actor: platform.user.id,
    action,
    tenantId,
    after: { tenantId, ...detail },
  });
}

async function activeMemberCount(tenantId: string): Promise<number> {
  const counts = await membershipRepository.countActiveByTenantIds([tenantId]);
  return counts.get(tenantId) ?? 0;
}

async function requireTenant(slug: string): Promise<TenantRegistryRow> {
  const tenant = await tenantRepository.findBySlug(slug);
  if (tenant === null) throw new AppError("NOT_FOUND", "No such workspace");
  return tenant;
}

/**
 * Apply a status change and record it, in one transaction, announced with the tenant it touches.
 *
 * Announced with the tenant being touched, not the admin's — there is no admin tenant, and the
 * audit row lands in that tenant's own `activity_log`, which is tenant-scoped with a WITH CHECK
 * policy. Unannounced the insert is refused under RLS, and since the whole thing is one
 * transaction, the status change goes back with it.
 */
async function changeStatus(
  platform: PlatformContext,
  tenant: TenantRegistryRow,
  nextStatus: string,
  action: string,
  detail: Readonly<Record<string, string>>,
): Promise<TenantRegistryRow> {
  return withAnnouncedTenant(tenant.id, async (tx) => {
    const updated = await platformTenantRepository.setStatus(tx, tenant.id, nextStatus);
    await auditCrossTenantAction(tx, platform, tenant.id, action, {
      from: tenant.status,
      to: nextStatus,
      ...detail,
    });
    return updated;
  });
}

export const platformAdminService = {
  /** The tenant registry, with health. Operational metadata only — never a tenant's contents. */
  async listTenants(user: AuthUser): Promise<GetPlatformTenantsResponse> {
    requirePlatformCapability(user, "viewTenants");
    const now = new Date();
    const tenants = await tenantRepository.listAll();
    const counts = await membershipRepository.countActiveByTenantIds(tenants.map((t) => t.id));
    return { tenants: tenants.map((t) => toDTO(t, counts.get(t.id) ?? 0, now)) };
  },

  /**
   * Read one tenant, from outside it. The audited crossing.
   *
   * The audit is written BEFORE `lastActivityAt` is read and in the same transaction, so a failure
   * to record the access fails the access. An unaudited cross-tenant read is precisely the event
   * this plane must not be able to produce.
   */
  async readTenant(user: AuthUser, slug: string): Promise<GetPlatformTenantResponse> {
    const platform = requirePlatformCapability(user, "readTenantData");
    const tenant = await requireTenant(slug);

    const lastActivityAt = await withAnnouncedTenant(tenant.id, async (tx) => {
      await auditCrossTenantAction(tx, platform, tenant.id, "platform_access", {
        scope: "tenant-metadata",
      });
      return platformTenantRepository.lastActivityAt(tx, tenant.id);
    });

    const memberCount = await activeMemberCount(tenant.id);
    return {
      tenant: {
        ...toDTO(tenant, memberCount, new Date()),
        lastActivityAt: lastActivityAt === null ? null : lastActivityAt.toISOString(),
      },
    };
  },

  /**
   * Suspend a tenant — every member is refused at the guard on their next request.
   *
   * This is not a banner. `resolveTenantContext` treats a suspended tenant as not live, so no
   * `TenantContext` is produced for anyone in it, whatever their role; the switcher stops offering
   * it too. There is no session to expire because there is no cached authority — the membership
   * and the tenant's state are re-read on every request.
   *
   * Already-suspended is a no-op that returns the current state rather than an error. Nothing
   * changed, so nothing is owed an audit row, and an operator retrying after a timeout should not
   * have to reason about which of their two clicks landed.
   */
  async suspendTenant(
    user: AuthUser,
    slug: string,
    input: SuspendTenantInput,
  ): Promise<PostPlatformTenantSuspendResponse> {
    const platform = requirePlatformCapability(user, "administerTenants");
    const tenant = await requireTenant(slug);
    const now = new Date();

    if (tenant.status === "suspended") {
      return { tenant: toDTO(tenant, await activeMemberCount(tenant.id), now) };
    }

    const updated = await changeStatus(platform, tenant, "suspended", "platform_tenant_suspended", {
      reason: input.reason,
    });
    return { tenant: toDTO(updated, await activeMemberCount(tenant.id), now) };
  },

  /**
   * Lift a suspension.
   *
   * ── Why the restored status is derived, not remembered ────────────────────────────────────────
   *
   * There is no column holding what the tenant was before it was suspended, and the schema is
   * frozen for the restructure, so restoring cannot simply put back what it found. Defaulting to
   * `active` would silently promote a suspended TRIAL into a paying-looking workspace — a billing
   * fact invented by a support action.
   *
   * `trialEndsAt` survives suspension untouched, so it already answers the question: a tenant whose
   * trial has not run out goes back to `trial`, and everything else goes back to `active`. That
   * reads the fact rather than reconstructing it from the audit trail, which would be treating the
   * log as state.
   */
  async restoreTenant(user: AuthUser, slug: string): Promise<PostPlatformTenantRestoreResponse> {
    const platform = requirePlatformCapability(user, "administerTenants");
    const tenant = await requireTenant(slug);
    const now = new Date();

    if (tenant.status !== "suspended") {
      return { tenant: toDTO(tenant, await activeMemberCount(tenant.id), now) };
    }

    const stillOnTrial =
      tenant.trialEndsAt !== null && tenant.trialEndsAt.getTime() > now.getTime();
    const nextStatus = stillOnTrial ? "trial" : "active";

    const updated = await changeStatus(
      platform,
      tenant,
      nextStatus,
      "platform_tenant_restored",
      {},
    );
    return { tenant: toDTO(updated, await activeMemberCount(tenant.id), now) };
  },
};
