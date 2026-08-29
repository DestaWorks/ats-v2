import { logger } from "@destaworks/config/logger";
import { writeAudit } from "@destaworks/db/audit";
import { auditRepository } from "@destaworks/db/repositories/audit.repository";
import { tenantRepository } from "@destaworks/db/tenancy/membership.repository";
import {
  supportWindowRepository,
  IMPERSONATION_ENTITY,
  SUPPORT_WINDOW_ACTION,
  SUPPORT_WINDOW_ENTITY,
} from "@destaworks/db/tenancy/support-window.repository";
import { withAnnouncedTenant } from "@destaworks/db/tenant-transaction";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import { systemClock, type Clock } from "@destaworks/domain/clock";
import { hasCapability } from "@destaworks/domain/constants";
import { systemContextFor } from "@destaworks/domain/system-context";
import type { TenantContext } from "@destaworks/domain/tenant";
import { toIso } from "@destaworks/domain/utils/iso";
import type { AuthUser } from "@destaworks/auth/guards";
import {
  isConsentLive,
  requireImpersonatedReadScope,
  type ImpersonatedReadScope,
  type SupportConsent,
} from "@destaworks/auth/impersonation";
import { AppError } from "@destaworks/integrations/http/app-error";
import { decodeCursor, encodeCursor } from "@destaworks/contracts/validation/cursor";
import {
  MAX_SUPPORT_WINDOW_MINUTES,
  SUPPORT_REASONS,
  type DeleteSupportWindowResponse,
  type GetImpersonatedActivityResponse,
  type GetSupportWindowResponse,
  type GrantSupportWindowInput,
  type ImpersonatedActivityEntryDTO,
  type PostSupportWindowResponse,
  type SupportReason,
  type SupportWindowDTO,
} from "@destaworks/contracts/validation/platform-impersonation";

/**
 * Support impersonation (SAAS-RESTRUCTURE-PLAN Phase 8) — "time-boxed, audited, consented", with
 * each of those three words implemented rather than asserted.
 *
 * This is the only feature in the system that deliberately crosses the tenant boundary the whole of
 * Phase 6 was built to enforce, so the design is written out here once, in full, and nowhere else.
 *
 * ── CONSENTED ──────────────────────────────────────────────────────────────────────────────────
 *
 * The tenant consents, not the platform. A workspace member holding `manageUsers` opens a bounded
 * support window; anyone with the same capability can withdraw it; and `getSupportWindow` lets the
 * workspace see at any moment whether one is open, so consent is observable and not merely
 * recorded. There is no path by which a platform admin grants themselves access: `grant` and
 * `revoke` take a `TenantContext` and are unreachable without a membership, while the read takes an
 * `AuthUser` and is unreachable without the allowlist. Absent consent, and withdrawn consent, are
 * the same answer as an expired one — refused.
 *
 * Consent is per-window and never standing. It is a duration a human chose for a reason they named,
 * capped server-side, and it lapses on its own rather than persisting until someone remembers to
 * turn it off. A workspace that grants a window and forgets about it is protected by the clock.
 *
 * ── TIME-BOXED ─────────────────────────────────────────────────────────────────────────────────
 *
 * The window IS the session. There is deliberately no second, admin-controlled session layered on
 * top: a second clock would be one the admin can start, and its only benefit over this is letting
 * them end early — which they achieve by not making requests. One clock, owned by the tenant,
 * cannot be extended by the party it constrains.
 *
 * Expiry is enforced by re-reading the ledger and comparing `expiresAt` to a `Clock` on EVERY
 * impersonated request. Nothing is cached, no token carries an `exp` the server trusts, and no
 * cookie `Max-Age` is load-bearing. A client that keeps sending a request after the window closes
 * gets a refusal, which is the whole point — client-side expiry is a courtesy, not a control.
 *
 * ── AUDITED ────────────────────────────────────────────────────────────────────────────────────
 *
 * Per 6.8, every crossing is audited into the tenant it touched, ids only, before it succeeds. The
 * audit write is awaited BEFORE the data is read, in a transaction announcing that tenant, exactly
 * as `platformAdminService.readTenant` does — so a failure to record the access fails the access,
 * and an unaudited crossing is not a thing this code can produce. The row lands in the customer's
 * own `activity_log`, which means their auditors see our visits, not just ours.
 *
 * Consent itself is audited by the same mechanism, because granting and revoking ARE the ledger
 * (see `support-window.repository.ts`). One write, so consent cannot be given without a trace.
 *
 * ── READ-ONLY, and why that is not merely a convention ─────────────────────────────────────────
 *
 * Impersonation never writes into a tenant. Support needs to see what happened; it does not need to
 * act as the customer, and a written change made under someone else's identity is the exact harm
 * an audit trail exists to make impossible. Three things enforce it rather than one:
 *
 *   1. The platform capability vocabulary has no write member. `PLATFORM_CAPABILITIES` is
 *      `viewTenants | administerTenants | readTenantData`, and `platform.ts` says it must never
 *      grow a per-feature entry — so an impersonated write is not expressible in the only
 *      vocabulary that can authorize a crossing.
 *   2. `ImpersonatedReadScope` is not a context. It carries no role and no membership, so it cannot
 *      be handed to a repository or to a capability check at all.
 *   3. `supportWindowRepository` exposes one method and it is a read. There is no update or delete
 *      on this path to reach for.
 *
 * The residual gap, stated honestly: converting the scope to `systemContextFor(tenantId)` yields a
 * context that COULD reach a write method if a future edit called one. That conversion happens at
 * exactly one call site, in `readActivityAsTenant`, and closing it fully would need a
 * `ReadOnlyTenantContext` threaded through every repository signature — a change worth making, and
 * a much larger one than this.
 *
 * ── DISTINGUISHABLE ────────────────────────────────────────────────────────────────────────────
 *
 * An impersonated request is marked in all three places it lands. In the audit row, by the
 * `impersonated-read` scope and by an actor id that is the admin's, never the customer's. In the
 * logs, by an explicit `impersonated: true` field. On the wire, by `ImpersonationMarkerDTO`, which
 * is a required field of a required object — a response of this type cannot fail to declare itself.
 */

function isSupportReason(value: unknown): value is SupportReason {
  return typeof value === "string" && (SUPPORT_REASONS as readonly string[]).includes(value);
}

/**
 * Read a ledger row's `after` blob back into a consent record.
 *
 * A hand-written guard rather than a schema because `application` carries no validator dependency,
 * and because the failure mode has to be chosen deliberately: anything unrecognised — a truncated
 * blob, a row written by an older shape, an unparseable date — yields `null`, which reads as "no
 * consent" and refuses. Garbage must never widen access.
 */
function payloadOf(row: { after: unknown } | null): Record<string, unknown> | null {
  if (row === null || row.after === null || typeof row.after !== "object") return null;
  return row.after as Record<string, unknown>;
}

function toConsent(row: { at: Date; after: unknown } | null): SupportConsent | null {
  const payload = row === null ? null : payloadOf(row);
  if (row === null || payload === null) return null;
  const scope = payload["scope"];
  if (scope === "revoke") {
    // A withdrawal is still a consent RECORD — it names the moment support stopped being able to
    // look, so the tenant can see the history — but it is never live.
    return { grantedAt: row.at, expiresAt: row.at, withdrawn: true };
  }
  if (scope !== "grant") return null;
  const expiresAtRaw = payload["expiresAt"];
  if (typeof expiresAtRaw !== "string") return null;
  const expiresAt = new Date(expiresAtRaw);
  if (Number.isNaN(expiresAt.getTime())) return null;
  return { grantedAt: row.at, expiresAt, withdrawn: false };
}

/** The reason on a grant row, for display back to the tenant. `null` on anything else. */
function toReason(row: { after: unknown } | null): SupportReason | null {
  const payload = payloadOf(row);
  if (payload === null || payload["scope"] !== "grant") return null;
  const reason = payload["reason"];
  return isSupportReason(reason) ? reason : null;
}

/**
 * When a window granted now must end.
 *
 * The schema already rejects an out-of-range `minutes` at the boundary, and this clamps again where
 * the instant is actually computed. That is not defensive re-validation for its own sake: the cap
 * is a business rule about how long a customer's data may be exposed, so it belongs where the
 * exposure is decided, and it must hold for any caller — including a future internal one that never
 * passed through the schema.
 */
function expiryFor(now: Date, minutes: number): Date {
  const capped = Math.min(Math.max(minutes, 0), MAX_SUPPORT_WINDOW_MINUTES);
  return new Date(now.getTime() + capped * 60_000);
}

function toWindowDTO(
  tenantId: string,
  consent: SupportConsent | null,
  reason: SupportReason | null,
  now: Date,
): SupportWindowDTO {
  if (consent === null) {
    return { tenantId, open: false, reason: null, grantedAt: null, expiresAt: null };
  }
  return {
    tenantId,
    open: isConsentLive(consent, now),
    reason,
    grantedAt: toIso(consent.grantedAt),
    expiresAt: toIso(consent.expiresAt),
  };
}

/** The gate on both consent writes. Same capability, same message, one place. */
function requireConsentManagement(ctx: TenantContext): void {
  if (!hasCapability(ctx.role, "manageUsers")) {
    throw new AppError("FORBIDDEN", "You don't have permission to do that");
  }
}

/** The current ledger state for a tenant, read through a least-privileged scoping context. */
async function readLedger(tenantId: string): Promise<{
  consent: SupportConsent | null;
  reason: SupportReason | null;
}> {
  const row = await supportWindowRepository.latestEvent(systemContextFor(tenantId));
  return { consent: toConsent(row), reason: toReason(row) };
}

/**
 * Record one impersonated crossing, in the tenant it touched.
 *
 * Announced with that tenant because the acting identity has none — `PlatformContext` carries no
 * `tenantId` by design, so `withAnnouncedTenant` is the only way this insert satisfies
 * `activity_log`'s `WITH CHECK` policy. Unannounced it is refused under RLS, and since the audit
 * gates the read, the feature stops working rather than reading unaudited.
 */
function auditImpersonatedRead(scope: ImpersonatedReadScope, view: string): Promise<unknown> {
  return withAnnouncedTenant(scope.tenantId, (tx) =>
    writeAudit(tx, {
      entity: IMPERSONATION_ENTITY,
      entityId: scope.tenantId,
      actor: scope.platformUserId,
      action: SUPPORT_WINDOW_ACTION,
      tenantId: scope.tenantId,
      after: {
        scope: "impersonated-read",
        view,
        tenantId: scope.tenantId,
        grantedAt: toIso(scope.grantedAt),
        expiresAt: toIso(scope.expiresAt),
      },
    }),
  );
}

/** One page of the support activity view. Bounded so a support read cannot pull a whole log. */
const ACTIVITY_PAGE_SIZE = 50;

export const platformImpersonationService = {
  /**
   * The workspace's own view of its consent. Readable by any member — knowing whether an outsider
   * can currently see your data is not a privileged fact, and gating it would make the guarantee
   * unverifiable by the people it protects.
   */
  async getSupportWindow(
    ctx: TenantContext,
    clock: Clock = systemClock,
  ): Promise<GetSupportWindowResponse> {
    const { consent, reason } = await readLedger(ctx.tenantId);
    return { window: toWindowDTO(ctx.tenantId, consent, reason, clock.now()) };
  },

  /**
   * Open a support window. The consent write, and its own audit row, are the same insert.
   *
   * Granting this confers nothing on the granter: it names no platform capability, mints no
   * `PlatformContext`, and opens a door only for an account that is already on the deployment
   * allowlist. An Owner who calls this has consented to being helped, not become a platform admin.
   */
  async grantSupportWindow(
    ctx: TenantContext,
    input: GrantSupportWindowInput,
    clock: Clock = systemClock,
  ): Promise<PostSupportWindowResponse> {
    requireConsentManagement(ctx);

    const now = clock.now();
    const expiresAt = expiryFor(now, input.minutes);

    await withTenantTransaction(ctx, (tx) =>
      writeAudit(tx, {
        entity: SUPPORT_WINDOW_ENTITY,
        entityId: ctx.tenantId,
        actor: ctx.user.id,
        action: SUPPORT_WINDOW_ACTION,
        tenantId: ctx.tenantId,
        after: { scope: "grant", expiresAt: toIso(expiresAt), reason: input.reason },
      }),
    );

    logger.warn("platform.support_window_granted", {
      tenantId: ctx.tenantId,
      reason: input.reason,
      expiresAt: toIso(expiresAt),
    });

    const consent: SupportConsent = { grantedAt: now, expiresAt, withdrawn: false };
    return { window: toWindowDTO(ctx.tenantId, consent, input.reason, now) };
  },

  /**
   * Withdraw consent, effective on the platform's very next request.
   *
   * The grant row is not deleted — nothing in this ledger is. A revoke row supersedes it, so the
   * trail still shows what was agreed to and for how long it stood.
   */
  async revokeSupportWindow(
    ctx: TenantContext,
    clock: Clock = systemClock,
  ): Promise<DeleteSupportWindowResponse> {
    requireConsentManagement(ctx);

    const now = clock.now();
    await withTenantTransaction(ctx, (tx) =>
      writeAudit(tx, {
        entity: SUPPORT_WINDOW_ENTITY,
        entityId: ctx.tenantId,
        actor: ctx.user.id,
        action: SUPPORT_WINDOW_ACTION,
        tenantId: ctx.tenantId,
        after: { scope: "revoke", tenantId: ctx.tenantId },
      }),
    );

    logger.warn("platform.support_window_revoked", { tenantId: ctx.tenantId });

    const consent: SupportConsent = { grantedAt: now, expiresAt: now, withdrawn: true };
    return { window: toWindowDTO(ctx.tenantId, consent, null, now) };
  },

  /**
   * Read a consenting tenant's activity trail from outside it — the audited crossing.
   *
   * Order matters and is the security property: resolve the tenant, verify the platform capability
   * AND live consent, write the audit row and wait for it, and only then read. Every earlier step
   * throws, so nothing is read before the crossing is both authorized and recorded.
   *
   * The trail is the right support surface precisely because it is the least revealing one that
   * answers "what happened here": `writeAudit` already redacts the designated PII keys, and the
   * projection below drops the `before`/`after` snapshots entirely, so no candidate or client
   * record leaves the tenant. The admin's own visit appears in the same list on the next read.
   */
  async readActivityAsTenant(
    user: AuthUser,
    slug: string,
    cursor: string | null,
    clock: Clock = systemClock,
  ): Promise<GetImpersonatedActivityResponse> {
    const tenant = await tenantRepository.findBySlug(slug);
    if (tenant === null) throw new AppError("NOT_FOUND", "No such workspace");

    const { consent } = await readLedger(tenant.id);
    const scope = requireImpersonatedReadScope(user, tenant.id, consent, clock);

    await auditImpersonatedRead(scope, "activity");

    logger.warn("platform.impersonated_read", {
      impersonated: true,
      tenantId: scope.tenantId,
      platformUserId: scope.platformUserId,
      view: "activity",
    });

    const decoded = cursor === null ? null : decodeCursor(cursor, "at_desc");
    if (cursor !== null && decoded === null) {
      throw new AppError("BAD_REQUEST", "Invalid page cursor");
    }

    const rows = await auditRepository.list(
      systemContextFor(scope.tenantId),
      {},
      decoded,
      ACTIVITY_PAGE_SIZE + 1,
    );
    const hasMore = rows.length > ACTIVITY_PAGE_SIZE;
    const page = hasMore ? rows.slice(0, ACTIVITY_PAGE_SIZE) : rows;
    const last = page[page.length - 1];

    const items: ImpersonatedActivityEntryDTO[] = page.map((row) => ({
      id: row.id,
      at: toIso(row.at),
      actor: row.actor,
      action: row.action,
      entity: row.entity,
      entityId: row.entityId,
    }));

    return {
      impersonation: {
        impersonated: true,
        tenantId: scope.tenantId,
        platformUserId: scope.platformUserId,
        expiresAt: toIso(scope.expiresAt),
      },
      items,
      nextCursor: hasMore && last !== undefined ? encodeCursor(last, "at_desc") : null,
      hasMore,
    };
  },
};
