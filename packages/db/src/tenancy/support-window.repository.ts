import type { AuditAction, AuditEntity } from "@destaworks/domain/constants";
import type { TenantContext } from "@destaworks/domain/tenant";
import { db, type ScopedTx } from "../tenant-scope";

/**
 * The support-consent ledger (SAAS-RESTRUCTURE-PLAN Phase 8).
 *
 * ── Why consent lives in `activity_log` and not in a table of its own ───────────────────────────
 *
 * Schema changes are frozen for the restructure, so this had to be expressed against an existing
 * model — but the append-only ledger turned out to be the better home regardless, and would be
 * worth keeping if the freeze lifted tomorrow. A `support_windows` row would be an UPDATE target:
 * whoever can revoke consent can also silently rewrite when it was granted. These rows cannot be
 * amended, only superseded, so the record of what a workspace agreed to and when is as strong as
 * the audit trail it sits in — which is the standard a consent record has to meet under HIPAA and
 * Proclamation 1321/2024, and stronger than a mutable row would have given us.
 *
 * It also collapses two problems into one: the consent decision and the audit of that decision are
 * the same write, so consent cannot be granted without leaving a trace.
 *
 * ── The shape of a ledger row ──────────────────────────────────────────────────────────────────
 *
 * `entity: "support_window"`, `entityId: <tenantId>`, `action: "platform_access"`, and the state in
 * `after.scope` — `"grant"` or `"revoke"`. The distinct `entity` is what makes the read a plain
 * indexed lookup on `[entity, entityId]` rather than a JSON-path filter, and keeps the ledger from
 * being buried under the `entity: "tenant"` rows that every impersonated READ appends. Current
 * state is the newest row: a grant that has not expired means open, anything else means closed.
 *
 * ── Read-only, and that is the type ────────────────────────────────────────────────────────────
 *
 * This module exposes exactly one method and it is a read. Appends go through `writeAudit`, which
 * only ever inserts. There is no update and no delete here to reach for, so "impersonation cannot
 * write" is a fact about the surface rather than a rule a reviewer has to enforce.
 */

/**
 * The ledger's vocabulary, typed against the domain unions so a rename over there breaks here.
 *
 * `support_window` is not yet a member of `AUDIT_ENTITIES` — the column is free-form `String` and
 * the label helpers humanize anything, so the rows display correctly today; adding it to the union
 * (which would also put it in the Activity Log's filter dropdown) is a one-line follow-up in
 * `domain/constants/audit.ts`, deliberately left out of this change's blast radius.
 */
const PLATFORM_ACCESS: AuditAction = "platform_access";
export const SUPPORT_WINDOW_ENTITY = "support_window";

/** Reusing `platform_access` rather than minting new actions keeps these rows on the one action an
 *  auditor already filters for, and already toned `danger` in the Activity Log. */
export const SUPPORT_WINDOW_ACTION: AuditAction = PLATFORM_ACCESS;

/** Rows an auditor filtering `entity: "tenant"` sees — the impersonated reads themselves. */
export const IMPERSONATION_ENTITY: AuditEntity = "tenant";

/** The newest ledger row, or `null` when the workspace has never been asked. */
export interface SupportWindowEventRow {
  id: string;
  at: Date;
  actor: string;
  after: unknown;
}

export const supportWindowRepository = {
  /**
   * The row that decides the current state: newest first, `id` breaking a same-instant tie so two
   * events written in the same millisecond resolve the same way on every read.
   *
   * Scoped through `db(ctx)` like every other `activity_log` access — `activity_log` is one of the
   * 39 RLS-forced tables, so an unscoped read of it returns nothing rather than someone else's
   * consent. The caller supplies a least-privileged context; this method grants no authority of its
   * own and deliberately cannot be asked for another tenant's row.
   */
  latestEvent(ctx: TenantContext, tx?: ScopedTx): Promise<SupportWindowEventRow | null> {
    return db(ctx, tx).activityLog.findFirst({
      where: {
        entity: SUPPORT_WINDOW_ENTITY,
        entityId: ctx.tenantId,
        action: SUPPORT_WINDOW_ACTION,
      },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      select: { id: true, at: true, actor: true, after: true },
    });
  },
};
