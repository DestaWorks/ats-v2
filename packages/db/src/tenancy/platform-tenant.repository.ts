import type { AnyTx } from "../tenant-scope";
import { TENANT_REGISTRY_SELECT, type TenantRegistryRow } from "./membership.repository";

/**
 * The platform plane's own data access (SAAS-RESTRUCTURE-PLAN 6.8) — the two operations that act
 * on a tenant a caller holds no context for.
 *
 * ── Why every method demands a transaction, and none of them opens one ─────────────────────────
 *
 * `tx` is the FIRST parameter and it is REQUIRED, unlike the tenancy reads next door where it is
 * an optional last argument. That is the whole design of this file. 6.8's rule is that a
 * cross-tenant action and its audit row commit together or not at all, and a repository that could
 * fall back to its own connection would let a caller satisfy the type checker while writing the
 * mutation outside the transaction the audit lives in. The suspension would stick and the record
 * of it would roll back — the exact failure the rule exists to make impossible.
 *
 * A required `tx` is also why this file names no unscoped client. `db(ctx, tx)` is unavailable
 * here — the platform axis has no `TenantContext`, which is the point of 6.8 — so the alternative
 * would have been another `dbUnscoped` call site. Taking the caller's transaction instead means
 * the connection has already announced its tenant, so `activity_log` is readable under RLS rather
 * than returning zero rows the day the policies are applied.
 */
export const platformTenantRepository = {
  /**
   * Move a tenant between `active`, `suspended` and `trial`.
   *
   * The only write on this axis. It returns the updated row so the caller renders the state that
   * committed rather than the one it asked for.
   */
  setStatus(tx: AnyTx, tenantId: string, status: string): Promise<TenantRegistryRow> {
    return tx.tenant.update({
      where: { id: tenantId },
      data: { status },
      select: TENANT_REGISTRY_SELECT,
    });
  },

  /**
   * When anything last happened in this tenant — the one health signal a registry column cannot
   * answer.
   *
   * A timestamp and nothing else. Reading the entity, actor or payload would make a health check
   * into a read of the customer's contents, which is a different capability (`readTenantData`) and
   * a different conversation. `take: 1` via `findFirst` on an indexed descending sort, so it stays
   * one row however long the trail is.
   *
   * `tenantId` is in the `where` explicitly because `tx` may be the RAW transaction client from
   * `withAnnouncedTenant`, which the scoping seam does not extend. RLS filters it a second time
   * from the announced connection; neither check is load-bearing alone.
   */
  async lastActivityAt(tx: AnyTx, tenantId: string): Promise<Date | null> {
    const row = await tx.activityLog.findFirst({
      where: { tenantId },
      orderBy: { at: "desc" },
      select: { at: true },
    });
    return row?.at ?? null;
  },
};
