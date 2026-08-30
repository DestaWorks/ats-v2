import type { Prisma } from "@destaworks/db/generated/prisma/client";
import { systemClock, type Clock } from "@destaworks/domain/clock";
import { utcDayStart, utcNextDayStart } from "@destaworks/domain/daily";
import {
  ACTIVE_STATUS_CODES,
  HOT_SCORE,
  TERMINAL_STATUS_CODES,
  hasCapability,
  isCandidateStatus,
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@destaworks/domain/constants";
import type {
  CandidateDetailDTO,
  CandidateProfileDTO,
  CandidateTrashDTO,
  CandidateTrashItemDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@destaworks/contracts/validation/candidate";
import type {
  CandidateListDTO,
  CandidateListItemDTO,
} from "@destaworks/contracts/validation/candidate";
import type {
  BoardResponse,
  BulkMoveResponse,
  CandidateCardDTO,
  ColumnPageDTO,
  DashboardStatsDTO,
} from "@destaworks/contracts/validation/pipeline";
import { encodeCursor, type PageCursor } from "@destaworks/contracts/validation/cursor";
import { toIso } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import { pageMeta } from "@destaworks/domain/pagination";
import { listSortToOrderBy, type ListSort } from "@destaworks/contracts/validation/pipeline";
import type { LogOutreachInput, OutreachAttemptDTO } from "@destaworks/contracts/validation/lead";
import type { JourneyDTO, JourneyEventDTO } from "@destaworks/contracts/validation/journey";
import { requireUser } from "@destaworks/auth/guards";
import type { TenantContext } from "@destaworks/domain/tenant";
import { writeAudit } from "@destaworks/db/audit";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import type { ScopedTx } from "@destaworks/db/tenant-scope";
import {
  candidateRepository,
  type CandidateRow,
  type CandidateCardRow,
} from "@destaworks/db/repositories/candidate.repository";
import {
  outreachRepository,
  type OutreachAttemptRow,
} from "@destaworks/db/repositories/outreach.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import {
  toClientRules,
  type ClientRulesRow,
} from "@destaworks/db/repositories/client-rules.repository";
import { documentRepository } from "@destaworks/db/repositories/document.repository";
import { noteRepository } from "@destaworks/db/repositories/note.repository";
import { stageHistoryRepository } from "@destaworks/db/repositories/stage-history.repository";
import { checkStageGate } from "@destaworks/domain/rules/stage-gates";
import { scoreCandidate } from "@destaworks/domain/rules/scoring";
import { getAutoDisqualify } from "@destaworks/domain/rules/disqualify";
import type { ClientRules } from "@destaworks/domain/rules/types";
import { getDaysInStage, isOverdue, isStuck } from "@destaworks/domain/rules/stage-timing";
import { AppError } from "@destaworks/integrations/http/app-error";
import { visibleNotes, toNoteDTO } from "./note.service";
import { toDocumentDTO } from "./document.dto";
import {
  toCandidateDTO,
  toCandidateProfileDTO,
  toDocumentSummaryDTO,
  toRuleCandidate,
  toStageEventDTO,
  type CandidateDTO,
  type RuleCandidateSource,
} from "./candidate.dto";
import {
  cachedClientNameMap,
  cachedClientRulesList,
} from "@destaworks/integrations/http/request-cache";

/**
 * Filters shared by the board + list reads. The three chip flags (`mine`/`overdue`/`stuck`) are
 * server-authoritative: `mine` is resolved to `viewer.id` HERE (never a client-supplied id), and
 * `overdue`/`stuck` become DB threshold predicates in the repository. `hot`/fit is intentionally
 * ABSENT — score is computed per page, not a DB column, so it stays a page-local UI toggle.
 */
export interface SharedListFilters {
  track?: Track;
  clientId?: string;
  search?: string;
  tags?: string[];
  licenseStatus?: LicenseStatus;
  /** Equality on the candidate source (canonical `SOURCES` value). */
  source?: string;
  /** View-as owner — filter to candidates added by this user id. `mine` wins when both are set. */
  ownerId?: string;
  /** Added-date range (any time within the given UTC days, inclusive). */
  addedFrom?: Date;
  addedTo?: Date;
  /** "My candidates" — translated to `createdById === viewer.id` by the service. */
  mine?: boolean;
  overdue?: boolean;
  stuck?: boolean;
}

/** Filters accepted by the board read. `status` narrows the board to a single-column focus. */
export interface BoardFilters extends SharedListFilters {
  status?: CandidateStatus;
}

/** Filters accepted by the flat list read — the shared set + a sort + the Hot filter + a 1-based page. */
export interface ListFilters extends SharedListFilters {
  status?: CandidateStatus;
  /** `newest`/`oldest` (DB createdAt) or `fit` (computed score, desc). Default `newest`. */
  sort?: ListSort;
  /** Score ≥ `HOT_SCORE`. Server-side over the FULL filtered set (score is computed, not a column). */
  hot?: boolean;
  /** 1-based page for OFFSET pagination (clamped to `[1, totalPages]`). */
  page?: number;
}

/**
 * Translate the service-level shared filters into repository filters — resolving `mine` to the
 * viewer's id server-side (the ONLY place `createdById` is set from a session, never the client).
 * `status` is threaded through separately by each caller (the list keeps it; the board strips it).
 */
function toRepoFilters(filters: SharedListFilters, viewer: TenantContext) {
  // `mine` always resolves to the SESSION user (never a client-supplied id); the explicit
  // view-as `ownerId` filter is just a filter over data every operator can already see.
  const createdById = filters.mine ? viewer.user.id : filters.ownerId;
  return {
    ...(filters.track !== undefined && { track: filters.track }),
    ...(filters.clientId !== undefined && { clientId: filters.clientId }),
    ...(filters.search !== undefined && { search: filters.search }),
    ...(filters.tags !== undefined && { tags: filters.tags }),
    ...(filters.licenseStatus !== undefined && { licenseStatus: filters.licenseStatus }),
    ...(filters.source !== undefined && { source: filters.source }),
    ...(createdById !== undefined && { createdById }),
    ...(filters.addedFrom ? { addedFrom: utcDayStart(filters.addedFrom) } : {}),
    ...(filters.addedTo ? { addedTo: utcNextDayStart(filters.addedTo) } : {}),
    ...(filters.overdue !== undefined && { overdue: filters.overdue }),
    ...(filters.stuck !== undefined && { stuck: filters.stuck }),
  };
}

/** Page size for the `/candidates` browse read — one OFFSET page of the numbered-pager flat table. */
const LIST_PAGE = 25;

/**
 * Stable sort of scored rows by fit DESC, nulls last (a `null` score means "nothing to score
 * against", so it always sinks below any real score, including a real `0`). Ties — and the whole
 * null group — keep their incoming (DB `orderBy`) order, so `fit` is deterministic across pages.
 */
function sortByFit<T>(
  scored: { row: T; score: number | null }[],
): { row: T; score: number | null }[] {
  return scored
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const as = a.entry.score;
      const bs = b.entry.score;
      if (as === null && bs === null) return a.index - b.index;
      if (as === null) return 1;
      if (bs === null) return -1;
      if (bs !== as) return bs - as;
      return a.index - b.index;
    })
    .map((e) => e.entry);
}

/**
 * Per-column page size for the board (OQ-5). Each active column ships one keyset page of at most
 * this many CARDS with its own `nextCursor`/`hasMore`; the column header still shows the TRUE total
 * (from the filtered `groupBy`). A "Load more" appends the next `ColumnPageDTO` to that column.
 */
const BOARD_PAGE = 25;

/** How many "needs attention" candidates the dashboard surfaces (a small, targeted read). */
const ATTENTION_LIMIT = 8;

/**
 * Cap on the `/trash` read. Trash is a manual admin surface with no cursor pagination in v1, so a
 * generous ceiling keeps a runaway trash from loading unbounded rows (D-1 / §1). Newest-deleted first.
 */
const TRASH_PAGE = 200;

/**
 * Build the `clientId → ClientRules` map the scorer consumes, joining the small `client_rules` table
 * to the `clients` name map ONCE per read (mirrors the `clientId → name` map already built). A rules
 * row whose client is absent (e.g. soft-deleted) is skipped — an orphan can't be scored/named.
 * `priority` / `autoDisqualify` are dropped here (not part of the scoring interface — see
 * `toClientRules`); `getCandidateDetail` reads them separately from the row when it needs the DQ list.
 */
function buildRulesMap(
  clientNames: Map<string, string>,
  rulesRows: ClientRulesRow[],
): Map<string, ClientRules> {
  const out = new Map<string, ClientRules>();
  for (const r of rulesRows) {
    const name = clientNames.get(r.clientId);
    if (!name) continue;
    out.set(r.clientId, toClientRules(r, name));
  }
  return out;
}

/** A rules row that constrains none of the four matchable dimensions offers no client-specific fit. */
function constrainsNothing(rules: ClientRules): boolean {
  return rules.states.length + rules.creds.length + rules.pops.length + rules.settings.length === 0;
}

/**
 * The candidate's fit `pct` for its ASSIGNED client, or `null` when there is nothing to score
 * against: no client assigned, the client has no rules row, or the rules constrain nothing
 * (e.g. *Future Potential Clients*, all arrays empty). `null` renders as "—", never as "0%";
 * a real `0` (the client DOES constrain dimensions but the candidate matched none) still renders.
 *
 * NOTE on the "constrains nothing" case: the pure `scoreCandidate` ALWAYS adds 10 to `max` for the
 * candidate-intrinsic license dimension, so `max === 0` is unreachable for a non-null rules row.
 * A client whose four matchable arrays (states/creds/pops/settings) are all empty therefore offers
 * NO client-specific fit — only the license floor would score, which is identical for every client —
 * so we report `null` rather than a misleading license-only pct. The `max === 0` guard is kept as
 * defense-in-depth. (Reuses the locked pure rule unchanged; the guard lives in the service.)
 */
function scoreFor(
  row: RuleCandidateSource,
  rulesByClient: Map<string, ClientRules>,
  now: Date,
): number | null {
  if (!row.clientId) return null;
  const rules = rulesByClient.get(row.clientId);
  if (!rules || constrainsNothing(rules)) return null;
  const { pct, max } = scoreCandidate(toRuleCandidate(row), rules, now);
  return max > 0 ? pct : null;
}

/**
 * ADVISORY auto-disqualify reasons for a row (board card / list row indicator — mirrors the detail
 * scoring block). License-based reasons apply with or without a client; the state-mismatch check
 * needs the assigned client's rules. Display-only — NEVER mutates status (that stays a human move).
 */
function dqFor(
  row: RuleCandidateSource,
  rulesByClient: Map<string, ClientRules>,
  now: Date,
): string[] {
  const rules = row.clientId ? (rulesByClient.get(row.clientId) ?? null) : null;
  return getAutoDisqualify(toRuleCandidate(row), rules, now);
}

/**
 * Project a raw candidate row onto the client-safe `CandidateCardDTO`. Reads fields directly off
 * `row` (a `CandidateCardRow` — `licenseNumber` already excluded at the query level, see
 * `candidateRepository.listCards`) rather than through `toCandidateDTO`: neither this card DTO
 * nor `CandidateListItemDTO` ever surfaces `licenseNumber`, so that PII-gating indirection was
 * pure overhead here. Timing is derived from `stageEnteredAt`; `score` (the precomputed fit
 * `pct`, or `null`) is passed in by the service.
 */
function toCard(
  row: CandidateCardRow,
  clientNames: Map<string, string>,
  now: Date,
  score: number | null,
  dqFlags: string[],
): CandidateCardDTO {
  const status = row.status as CandidateStatus;
  return {
    id: row.id,
    name: row.name,
    track: row.track as Track,
    credential: row.credential,
    licenseState: row.licenseState,
    licenseStatus: row.licenseStatus as LicenseStatus,
    clientId: row.clientId,
    clientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
    status,
    stageOrder: row.stageOrder,
    daysInStage: getDaysInStage(row.stageEnteredAt, now),
    isOverdue: isOverdue(status, row.stageEnteredAt, now),
    isStuck: isStuck(row.stageEnteredAt, now),
    score,
    dqFlags,
  };
}

/**
 * Project a raw candidate row onto the `CandidateListItemDTO` for the browse list. Reads fields
 * directly off `row` (a `CandidateCardRow`) — same reasoning as `toCard`, this type never
 * surfaces `licenseNumber`. `clientName` is resolved from the batch-loaded client map.
 */
function toListItem(
  row: CandidateCardRow,
  clientNames: Map<string, string>,
  now: Date,
  score: number | null,
  dqFlags: string[],
): CandidateListItemDTO {
  const status = row.status as CandidateStatus;
  return {
    id: row.id,
    name: row.name,
    credential: row.credential,
    track: row.track,
    clientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
    status,
    statusLabel: statusLabel(status),
    licenseStatus: row.licenseStatus,
    daysInStage: getDaysInStage(row.stageEnteredAt, now),
    createdAt: row.createdAt.toISOString(),
    score,
    dqFlags,
  };
}

/**
 * Project a shared `outreach_attempts` row onto the wire DTO (mirrors the lead service's private
 * mapper — kept local because lead.service imports candidateService, so importing back would cycle).
 */
function toOutreachDTO(
  row: OutreachAttemptRow,
  actorNames: Map<string, string>,
): OutreachAttemptDTO {
  return {
    id: row.id,
    channel: row.channel as OutreachAttemptDTO["channel"],
    at: row.at.toISOString(),
    note: row.note,
    actorId: row.actorId,
    actorName: actorNames.get(row.actorId) ?? null,
  };
}

/**
 * Project a PII-gated candidate DTO onto a `/trash` row. The DTO has ALREADY passed through
 * `toCandidateDTO` (the PII boundary — no `licenseNumber`), so this only resolves the display
 * joins: `clientName` from the batch client map, `deletedByName` from the batch user-name map
 * (falls back to `null` for an absent/removed actor), and `statusLabel` from the stored status
 * (unchanged by delete). `deletedAt` is a non-null Date on a trashed row (guaranteed by `listDeleted`).
 */
function toTrashItem(
  dto: CandidateDTO,
  clientNames: Map<string, string>,
  actorNames: Map<string, string>,
): CandidateTrashItemDTO {
  const status = dto.status as CandidateStatus;
  return {
    id: dto.id,
    name: dto.name,
    credential: dto.credential,
    clientName: dto.clientId ? (clientNames.get(dto.clientId) ?? null) : null,
    status,
    statusLabel: statusLabel(status),
    deletedAt: (dto.deletedAt as Date).toISOString(),
    deletedByName: dto.deletedById ? (actorNames.get(dto.deletedById) ?? null) : null,
  };
}

/**
 * Domain input for creating a candidate. Interactive creates ALWAYS start at `NEW_CANDIDATE`
 * (stage 0) — status is intentionally NOT accepted here, so a create can never drop a candidate
 * mid-pipeline and skip the stage gate / stage-history / `placedAt` contract. Status only advances
 * through `move`. Bulk historical import that legitimately lands candidates at their current stage
 * uses the repository's `upsertByLegacyId` (the one-shot ETL path), not this service method.
 */
export interface CandidateCreateInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  employer?: string | null;
  yearsExp?: number | null;
  credential?: string | null;
  population?: string | null;
  setting?: string | null;
  track?: string;
  source?: string | null;
  tags?: string[];
  outreachAttempts?: number;
  licenseState?: string | null;
  licenseNumber?: string | null;
  licenseStatus?: string;
  licenseExpiry?: Date | null;
  clientId?: string | null;
  legacyId?: string | null;
  /** Wave 3.5 — which Open Role this candidate was promoted to fill, if any (server-composed only). */
  filledFromRoleId?: string | null;
}

/** Editable fields. `status`/pipeline timing are owned by `move` (denormalization contract). */
export type CandidateUpdateInput = Partial<Omit<CandidateCreateInput, "legacyId">>;

/**
 * Narrow a full candidate row to just the keys present in `input`, for a small audit snapshot.
 * before/after may hold PII — audit rows are `viewAudit`-gated (see `db/audit.ts`) and never logged.
 */
function pickAudited(row: CandidateRow, input: CandidateUpdateInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(input) as (keyof CandidateUpdateInput)[]) {
    out[key] = (row as Record<string, unknown>)[key];
  }
  return out;
}

/**
 * Candidate business logic. Services orchestrate repositories + pure rules and own authZ; they
 * never touch Prisma directly.
 *
 * AUTHZ: there is no candidate-specific capability — working the pipeline (create / edit / move /
 * soft-delete) is open to any signed-in user (Screener / Associate are the primary pipeline
 * workers and hold no capabilities). So `create`/`update`/`softDelete` gate with `requireUser()`;
 * `move` receives the already-authenticated `TenantContext` from its caller (the drag / bulk-move
 * handler). Hard purge — the capability-gated (`purgeCandidate`) destructive path — lands in
 * Wave 2.5, separate from this soft delete.
 */
export const candidateService = {
  /**
   * Create a candidate. COMPOSABLE (OQ-1): `opts.user` lets a caller (e.g. `leadService.promote`)
   * supply the already-authenticated actor instead of re-`requireUser`ing, and `opts.tx` lets it run
   * the insert INSIDE an existing transaction so the create is atomic with the caller's other writes
   * (the lead → Promoted flip). Called bare — `create(input)` — it self-`requireUser`s and opens its
   * OWN transaction (backward-compatible with the manual-create route).
   *
   * The forced-field contract lives here in ONE place: every interactive create starts New (stage 0,
   * `createdById = user.id`) — no `status` arg, so a create can never drop a candidate mid-pipeline
   * and skip the gate. NOW audited (action `create`) so a manually-created OR promoted candidate has
   * a creation trail (interactive create previously wrote none — OQ-2).
   */
  async create(input: CandidateCreateInput, opts?: { user?: TenantContext; tx?: ScopedTx }) {
    const user = opts?.user ?? (await requireUser());
    const data: Prisma.CandidateUncheckedCreateInput = {
      ...input,
      status: "NEW_CANDIDATE",
      stageOrder: statusOrder("NEW_CANDIDATE"),
      createdById: user.user.id,
    };
    const run = async (tx: ScopedTx) => {
      const created = await candidateRepository.create(user, data, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: created.id,
        actor: user.user.id,
        action: "create",
        after: { status: created.status, clientId: created.clientId },
      });
      return created;
    };
    // Compose inside the caller's tx (promote), else open our own so create + audit stay atomic.
    return opts?.tx ? run(opts.tx) : withTenantTransaction(user, run);
  },

  /**
   * Edit a candidate's PROFILE fields (identity/contact/clinical + `licenseState`/`clientId`).
   * Status / pipeline timing stay owned by `move`; license VERIFICATION fields stay owned by
   * `verifyLicense` — the zod schema at the route (`updateCandidateSchema.strict()`) rejects those
   * keys, so a pipeline/verification field can never route through here. Edit is an audited PII
   * mutation, so the repo update + `writeAudit` (before/after of the CHANGED keys only) run in one
   * transaction. `user` is the acting caller (route `requireUser()`); the `licenseNumber` gate is
   * enforced at the route before this is reached (design D-5).
   */
  async update(id: string, input: UpdateCandidateInput, ctx: TenantContext) {
    const existing = await candidateRepository.findById(ctx, id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    const data = defined(input);
    return withTenantTransaction(ctx, async (tx) => {
      const updated = await candidateRepository.update(ctx, id, data, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: ctx.user.id,
        action: "update",
        before: pickAudited(existing, data),
        after: pickAudited(updated, data),
      });
      return updated;
    });
  },

  /**
   * Soft-delete → Trash. Open to any operator (`requireUser`) — reversible, matching the pipeline
   * authZ model. NOW audited (action `delete`, mirrors `update`'s trail): the repo `softDelete` +
   * `writeAudit` run in one transaction so the trail can never drift. `findById` (which excludes
   * already-deleted rows) is the existence/idempotency guard — a missing OR already-trashed candidate
   * → `NOT_FOUND` (you can't re-trash a trashed candidate).
   */
  async softDelete(id: string) {
    const user = await requireUser();
    const existing = await candidateRepository.findById(user, id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return withTenantTransaction(user, async (tx) => {
      const deleted = await candidateRepository.softDelete(user, id, user.user.id, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.user.id,
        action: "delete",
        before: { deletedAt: null },
        after: { deletedAt: deleted.deletedAt, deletedById: user.user.id, status: existing.status },
      });
      return deleted;
    });
  },

  /**
   * Restore a soft-deleted candidate from Trash. Open to any operator (`requireUser` at the route,
   * `user` forwarded here) — reversible, matching `softDelete`. Loads the row WITH
   * `includeDeleted` (the default read excludes trashed rows); a missing row → `NOT_FOUND`, a LIVE
   * (non-trashed) row → `CONFLICT` (nothing to restore). Only clears `deletedAt`/`deletedById` — the
   * candidate returns to EXACTLY the stage it left (status/stageOrder/stageEnteredAt untouched, D-9).
   * Audited (action `restore`) in the same transaction as the repo `restore`.
   */
  async restore(id: string, ctx: TenantContext) {
    const existing = await candidateRepository.findById(ctx, id, { includeDeleted: true });
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    if (existing.deletedAt === null) throw new AppError("CONFLICT", "Candidate is not in Trash");
    return withTenantTransaction(ctx, async (tx) => {
      const restored = await candidateRepository.restore(ctx, id, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: ctx.user.id,
        action: "restore",
        before: { deletedAt: existing.deletedAt, deletedById: existing.deletedById },
        after: { deletedAt: null, status: restored.status },
      });
      return restored;
    });
  },

  /**
   * PERMANENTLY purge a candidate — the irreversible, cascading hard delete (documents, notes, stage
   * history all `onDelete: Cascade`). SERVER-AUTHORITATIVE gate: requires `purgeCandidate` (Owner /
   * Admin only, `roles.ts`) even though the route also `requireCapability`s it — the service is safe
   * by itself. TWO-STEP SAFETY (D-4): purge acts ONLY on an already-soft-deleted candidate — a live
   * one throws `CONFLICT`, so there is no one-click permanent delete anywhere. The audit (action
   * `purge`) is written BEFORE the delete in the same transaction; `activity_log` has no FK to
   * `Candidate`, so the permanent-deletion event survives the cascade. Returns only `{ id }` (the
   * record is gone — never echo PII).
   */
  async purge(id: string, ctx: TenantContext) {
    if (!hasCapability(ctx.role, "purgeCandidate")) {
      throw new AppError("FORBIDDEN", "You don't have permission to purge candidates");
    }
    const existing = await candidateRepository.findById(ctx, id, { includeDeleted: true });
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    if (existing.deletedAt === null) {
      throw new AppError("CONFLICT", "Only trashed candidates can be purged");
    }
    return withTenantTransaction(ctx, async (tx) => {
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: ctx.user.id,
        action: "purge",
        before: { name: existing.name, status: existing.status, deletedAt: existing.deletedAt },
      });
      await candidateRepository.purge(ctx, id, tx); // cascades documents / notes / stage history
      return { id };
    });
  },

  /**
   * The `/trash` payload — soft-deleted candidates (newest-deleted first), PII-gated. AuthZ is the
   * caller's (RSC `getCurrentUser()` / route `requireUser`); `viewer` drives the PII boundary via
   * `toCandidateDTO` (no `licenseNumber`, ever, on a trash row). `clientName` is resolved from a
   * one-shot client map; `deletedByName` from a SINGLE batched user-name lookup
   * (`userRepository.namesByIds`) rather than N per-row queries.
   */
  async listTrash(viewer: TenantContext): Promise<CandidateTrashDTO> {
    const rows = await candidateRepository.listDeleted(viewer, TRASH_PAGE);
    const clientNames = await cachedClientNameMap(viewer);
    const actorIds = rows.map((r) => r.deletedById).filter((id): id is string => id !== null);
    const actorNames = await userRepository.namesByIds(actorIds);
    const items = rows.map((row) =>
      toTrashItem(toCandidateDTO(row, viewer), clientNames, actorNames),
    );
    return { items };
  },

  /**
   * Read just one candidate's PROFILE fields (Wave 4.1, Templates) — the recipient picker fetches
   * this after a candidate is selected from the (lightweight `CandidateListItemDTO`) search
   * results, since filling a template needs email/phone/city/employer/etc. that the list item
   * doesn't carry. Deliberately NOT `getCandidateDetail` below — that composite also loads
   * documents/notes/history/outreach, all unused here.
   */
  async getProfile(id: string, viewer: TenantContext): Promise<CandidateProfileDTO> {
    const candidate = await candidateRepository.findById(viewer, id);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");
    return toCandidateProfileDTO(toCandidateDTO(candidate, viewer));
  },

  /**
   * Read one candidate's full profile — the single composite the detail page needs (candidate +
   * documents + role-scoped notes + recent stage history + clientName), in one `CandidateDetailDTO`.
   * The RSC calls this DIRECTLY (no self-fetch); authZ is the caller's (`getCurrentUser()`), and
   * `viewer` drives the PII gate. Every PII boundary is REUSED, not re-implemented: `toCandidateDTO`
   * omits `licenseNumber`, `toDocumentDTO` omits `extractedText`/`extractedData`, both unless the
   * viewer holds `viewCredentials`; note visibility is `visibleNotes` (server-side, §3.2).
   */
  async getCandidateDetail(
    id: string,
    viewer: TenantContext,
    clock: Clock = systemClock,
  ): Promise<CandidateDetailDTO> {
    // `findById` doesn't gate the other 6 reads — none of them depend on its result, only on the
    // already-known `id` — so all 7 fire in one round trip instead of findById-then-the-rest.
    const [candidate, documents, notes, history, clientNames, rulesRows, outreachRows] =
      await Promise.all([
        candidateRepository.findById(viewer, id),
        documentRepository.listByCandidate(viewer, id),
        noteRepository.listByCandidate(viewer, id),
        stageHistoryRepository.listByCandidate(viewer, id),
        cachedClientNameMap(viewer),
        cachedClientRulesList(viewer),
        outreachRepository.listForCandidate(viewer, id),
      ]);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");
    // Attempt actors → display names in ONE batched read (mirrors the lead detail; no N+1).
    const outreachActors = await userRepository.namesByIds(outreachRows.map((a) => a.actorId));
    const outreach = outreachRows.map((a) => toOutreachDTO(a, outreachActors));

    const clientName = candidate.clientId ? (clientNames.get(candidate.clientId) ?? null) : null;

    // Scoring block (S-4/S-7): compute the fit + flags for the assigned client and the ADVISORY
    // auto-DQ reasons. `null` when there's nothing to score against (no client / no rules / max 0).
    // Auto-DQ is display-only — it NEVER mutates the candidate's status (that stays a human `move`).
    const rulesByClient = buildRulesMap(clientNames, rulesRows);
    const rules = candidate.clientId ? (rulesByClient.get(candidate.clientId) ?? null) : null;
    const ruleCandidate = toRuleCandidate(candidate);
    const now = clock.now();
    const raw = scoreCandidate(ruleCandidate, rules, now);
    // Non-null only when the client constrains at least one matchable dimension (see `scoreFor`) —
    // a constrains-nothing client offers no client-specific fit to explain.
    const scoring =
      rules && !constrainsNothing(rules) && raw.max > 0
        ? {
            pct: raw.pct,
            score: raw.score,
            max: raw.max,
            flags: raw.flags,
            autoDisqualify: getAutoDisqualify(ruleCandidate, rules, now),
          }
        : null;

    return {
      candidate: toCandidateProfileDTO(toCandidateDTO(candidate, viewer)),
      clientName,
      documents: documents.map((d) => toDocumentSummaryDTO(toDocumentDTO(d, viewer))),
      notes: visibleNotes(notes, viewer).map(toNoteDTO),
      stageHistory: history.slice(0, 10).map(toStageEventDTO),
      outreach,
      canVerifyCredentials: hasCapability(viewer.role, "viewCredentials"),
      scoring,
    };
  },

  /**
   * The candidate's full JOURNEY (legacy "Candidate Journey" modal parity): sourcing origin +
   * promote hand-off (from the promoted-from lead, when one exists) + EVERY stage transition +
   * the viewer-VISIBLE notes (same `visibleNotes` scope as the detail — the journey can never
   * leak a note type the tabs hide) + the merged outreach log, oldest first. Actor names resolve
   * in one batched read. `spanDays` = first→last event, for the "N events · spans N days" line.
   */
  async getJourney(id: string, viewer: TenantContext): Promise<JourneyDTO> {
    const candidate = await candidateRepository.findByIdWithPromotedFromLead(viewer, id);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");
    const lead = candidate.promotedFromLead;

    const [history, notes, outreachRows, clientNames] = await Promise.all([
      stageHistoryRepository.listByCandidate(viewer, id),
      noteRepository.listByCandidate(viewer, id),
      outreachRepository.listForCandidate(viewer, id),
      cachedClientNameMap(viewer),
    ]);
    const actorIds = [
      ...history.map((h) => h.actorId),
      ...outreachRows.map((a) => a.actorId),
      ...(lead?.createdById ? [lead.createdById] : []),
      ...(candidate.createdById ? [candidate.createdById] : []),
    ];
    const names = await userRepository.namesByIds(actorIds);
    const nameOf = (actorId: string | null) => (actorId ? (names.get(actorId) ?? null) : null);
    const stageName = (code: string | null) =>
      code === null ? "—" : isCandidateStatus(code) ? statusLabel(code) : code;

    const events: JourneyEventDTO[] = [];
    if (lead) {
      const targetClient = lead.clientId ? (clientNames.get(lead.clientId) ?? null) : null;
      events.push({
        kind: "sourced",
        at: toIso(lead.createdAt),
        actorName: nameOf(lead.createdById),
        detail:
          [lead.source, targetClient ? `target ${targetClient}` : null]
            .filter(Boolean)
            .join(" · ") || null,
      });
      events.push({
        kind: "promoted",
        at: toIso(candidate.createdAt),
        actorName: nameOf(candidate.createdById),
        detail: `Now in the pipeline as ${candidate.name}`,
      });
    } else {
      events.push({
        kind: "created",
        at: toIso(candidate.createdAt),
        actorName: nameOf(candidate.createdById),
        detail: candidate.source,
      });
    }
    for (const h of history) {
      events.push({
        kind: "stage",
        at: toIso(h.enteredAt),
        actorName: nameOf(h.actorId),
        detail: `${stageName(h.fromStatus)} → ${stageName(h.toStatus)}`,
      });
    }
    for (const n of visibleNotes(notes, viewer)) {
      const noteType = n.noteType as JourneyEventDTO["noteType"];
      events.push({
        kind: "note",
        at: toIso(n.createdAt),
        actorName: n.authorName,
        detail: n.body,
        ...(noteType !== undefined && { noteType }),
      });
    }
    for (const a of outreachRows) {
      const channel = a.channel as JourneyEventDTO["channel"];
      events.push({
        kind: "outreach",
        at: toIso(a.at),
        actorName: nameOf(a.actorId),
        detail: a.note,
        ...(channel !== undefined && { channel }),
      });
    }

    events.sort((a, b) => a.at.localeCompare(b.at));
    const firstAt = events[0]?.at;
    const lastAt = events.at(-1)?.at;
    const spanDays =
      events.length > 1 && firstAt !== undefined && lastAt !== undefined
        ? Math.max(
            0,
            Math.round((new Date(lastAt).getTime() - new Date(firstAt).getTime()) / 86_400_000),
          )
        : 0;
    return { events, spanDays };
  },

  /**
   * Log one outreach attempt on a CANDIDATE (`candidate_log_outreach` parity — the lead-side twin
   * lives in `lead.service.logOutreach`). Open to any operator. In one transaction: insert the
   * attempt (shared `outreach_attempts` table), bump the candidate's denormalized counter, and
   * audit. Returns the fresh attempt DTO (actor name resolved) for in-place prepend.
   */
  async logOutreach(
    id: string,
    input: LogOutreachInput,
    ctx: TenantContext,
  ): Promise<OutreachAttemptDTO> {
    const existing = await candidateRepository.findById(ctx, id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    const attempt = await withTenantTransaction(ctx, async (tx) => {
      const created = await outreachRepository.createForCandidate(
        ctx,
        id,
        {
          channel: input.channel,
          note: input.note ?? null,
          actorId: ctx.user.id,
          templateId: input.templateId ?? null,
        },
        tx,
      );
      await candidateRepository.incrementOutreach(ctx, id, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: ctx.user.id,
        action: "log_outreach",
        before: null,
        after: { channel: input.channel, attemptId: created.id },
      });
      return created;
    });
    const actorNames = await userRepository.namesByIds([attempt.actorId]);
    return toOutreachDTO(attempt, actorNames);
  },

  /**
   * Verify a candidate's license — sets `licenseStatus` (+ optional `licenseExpiry`/`licenseNumber`)
   * and stamps WHO/WHEN (`licenseVerifiedById`/`licenseVerifiedAt`). License status DRIVES the stage
   * gates (INITIAL_SCREENING needs verified, SUBMITTED needs `Active`), so this is a load-bearing
   * pipeline action — OPEN TO OPERATORS (`requireUser` at the route), matching legacy. Writing
   * `licenseNumber` still requires `viewCredentials` (enforced at the route, design D-6). The update
   * + audit run in one transaction.
   */
  async verifyLicense(id: string, input: VerifyLicenseInput, ctx: TenantContext) {
    const existing = await candidateRepository.findById(ctx, id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    const now = new Date();
    return withTenantTransaction(ctx, async (tx) => {
      const updated = await candidateRepository.update(
        ctx,
        id,
        {
          licenseStatus: input.licenseStatus,
          ...(input.licenseExpiry !== undefined ? { licenseExpiry: input.licenseExpiry } : {}),
          ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
          licenseVerifiedAt: now,
          licenseVerifiedById: ctx.user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: ctx.user.id,
        action: "verify_license",
        before: { licenseStatus: existing.licenseStatus, licenseExpiry: existing.licenseExpiry },
        after: { licenseStatus: updated.licenseStatus, licenseExpiry: updated.licenseExpiry },
      });
      return updated;
    });
  },

  /**
   * Read the `/candidates` browse list — a flat, PII-gated, server OFFSET-paginated table (distinct
   * from the funnel board). AuthZ is the caller's (RSC `getCurrentUser()` / route `requireUser()`);
   * `viewer` drives the PII gate (`toCandidateDTO` omits `licenseNumber`) AND resolves `mine`.
   *
   * EVERYTHING resolves server-side. Two execution paths, one contract:
   *  - **DB path** (`newest`/`oldest`, no Hot): cheap SQL — `count` + a `skip`/`take` `ORDER BY
   *    createdAt` page. Score is computed only for the page's rows (a displayed column).
   *  - **Score path** (`fit` sort OR Hot filter): score is COMPUTED per client-rules, not a DB
   *    column, so it can't be an SQL `ORDER BY`/`WHERE`. We load the full filtered set (ordered by a
   *    stable DB base), score it, apply Hot (≥ `HOT_SCORE`) and/or the fit sort in memory, then slice
   *    the requested page. Fine at ATS scale (hundreds–low-thousands); always fresh (rules stay data).
   *
   * `total` is the true post-filter count (the Hot filter's denominator is the in-memory count).
   * `page` is clamped to `[1, totalPages]`. `clientName` is a one-shot in-memory join over `clients`.
   */
  async listCandidates(
    filters: ListFilters = {},
    viewer: TenantContext,
  ): Promise<CandidateListDTO> {
    const now = new Date();
    const sort: ListSort = filters.sort ?? "newest";
    const hot = filters.hot ?? false;
    const requestedPage = Math.max(1, filters.page ?? 1);
    const baseOrder = listSortToOrderBy(sort);
    const repoFilters = {
      ...toRepoFilters(filters, viewer),
      ...(filters.status !== undefined && { status: filters.status }),
    };

    const namesAndRules = Promise.all([cachedClientNameMap(viewer), cachedClientRulesList(viewer)]);

    // DB path — sort is DB-native and Hot is off, so paginate in SQL. `count`, the page read, and
    // the name/rules lookup are all independent of each other (perf audit 2026-08-05 — these used
    // to run as 2 sequential round trips), so fire all three in ONE round trip. The page read is
    // OPTIMISTIC — it uses the unclamped `requestedPage` — because `skip` only needs `total` in
    // the rare case the requested page is actually out of range; that case gets one corrective
    // re-fetch rather than paying a second round trip on every request.
    if (sort !== "fit" && !hot) {
      // `requestedPage` is user-controlled (a URL query param) and only lower-bounded — the OLD
      // code was safe because it always clamped against the DB-verified `total` BEFORE querying.
      // The optimistic query below can't wait for `total`, so it needs its OWN defensive ceiling
      // (security audit 2026-08-05): otherwise `?page=999999999` sends an enormous, attacker-
      // controlled OFFSET straight to Postgres. This cap never affects the real result — `meta`
      // still clamps to the true last page from `total` below, and an over-cap request simply
      // falls into the existing corrective-refetch path, exactly like any other out-of-range page.
      const MAX_OPTIMISTIC_PAGE = 10_000;
      const optimisticSkip = (Math.min(requestedPage, MAX_OPTIMISTIC_PAGE) - 1) * LIST_PAGE;
      const [[clientNames, rulesRows], total, optimisticRows] = await Promise.all([
        namesAndRules,
        candidateRepository.count(viewer, { ...repoFilters, now }),
        candidateRepository.listCards(viewer, {
          ...repoFilters,
          orderBy: baseOrder,
          skip: optimisticSkip,
          take: LIST_PAGE,
          now,
        }),
      ]);
      const rulesByClient = buildRulesMap(clientNames, rulesRows);
      const meta = pageMeta(total, requestedPage, LIST_PAGE);
      const rows =
        meta.page === requestedPage
          ? optimisticRows
          : await candidateRepository.listCards(viewer, {
              ...repoFilters,
              orderBy: baseOrder,
              skip: (meta.page - 1) * LIST_PAGE,
              take: LIST_PAGE,
              now,
            });
      const candidates = rows.map((row) =>
        toListItem(
          row,
          clientNames,
          now,
          scoreFor(row, rulesByClient, now),
          dqFor(row, rulesByClient, now),
        ),
      );
      return { candidates, ...meta };
    }

    // Score path — Hot and/or fit need the computed score across the WHOLE filtered set. The
    // name/rules lookup doesn't depend on the rows either, so it runs alongside them too.
    const [[clientNames, rulesRows], allRows] = await Promise.all([
      namesAndRules,
      candidateRepository.listCards(viewer, { ...repoFilters, orderBy: baseOrder, now }),
    ]);
    const rulesByClient = buildRulesMap(clientNames, rulesRows);
    let scored = allRows.map((row) => ({ row, score: scoreFor(row, rulesByClient, now) }));
    if (hot) scored = scored.filter((s) => s.score !== null && s.score >= HOT_SCORE);
    if (sort === "fit") scored = sortByFit(scored);
    const meta = pageMeta(scored.length, requestedPage, LIST_PAGE);
    const pageRows = scored.slice((meta.page - 1) * LIST_PAGE, meta.page * LIST_PAGE);
    const candidates = pageRows.map((s) =>
      toListItem(s.row, clientNames, now, s.score, dqFor(s.row, rulesByClient, now)),
    );
    return { candidates, ...meta };
  },

  /**
   * Dashboard summary WITHOUT loading the whole candidate table (audit perf finding). Per-status
   * counts come from a Prisma `groupBy` (the funnel + total/active/terminal); the "needs attention"
   * list is a SMALL targeted read of the oldest-in-stage active candidates (`take: ATTENTION_LIMIT`)
   * filtered to those actually overdue/stuck. AuthZ is the caller's — the card DTO never carries
   * `licenseNumber`, so there's no PII gate here to drive.
   */
  async dashboardStats(viewer: TenantContext): Promise<DashboardStatsDTO> {
    const [grouped, staleRows, clientNames, rulesRows] = await Promise.all([
      candidateRepository.groupByStatus(viewer),
      candidateRepository.listStaleActive(viewer, ATTENTION_LIMIT),
      cachedClientNameMap(viewer),
      cachedClientRulesList(viewer),
    ]);

    const countByStatus = new Map<string, number>();
    for (const g of grouped) countByStatus.set(g.status, g._count._all);

    let total = 0;
    let active = 0;
    for (const [status, n] of countByStatus) {
      total += n;
      if (isCandidateStatus(status) && !isTerminalStatus(status)) active += n;
    }

    const columns = ACTIVE_STATUS_CODES.map((status) => ({
      status,
      label: statusLabel(status),
      count: countByStatus.get(status) ?? 0,
    }));

    const rulesByClient = buildRulesMap(clientNames, rulesRows);
    const now = new Date();
    const attention = staleRows
      .map((row) =>
        toCard(
          row,
          clientNames,
          now,
          scoreFor(row, rulesByClient, now),
          dqFor(row, rulesByClient, now),
        ),
      )
      .filter((c) => c.isOverdue || c.isStuck);

    return { total, active, terminal: total - active, columns, attention };
  },

  /**
   * Read the pipeline board — funnel-grouped candidates with derived stage timing. AuthZ is the
   * caller's (route `requireUser()` / RSC `getCurrentUser()`); `viewer` is passed in for the PII
   * boundary. Returns exactly the 9 active columns (order 0..8, empties present), a terminal
   * summary (counts always; card lists only when `includeTerminal`), and aggregate `meta`.
   *
   * `clientName` is resolved by fetching the small `clients` table once into an `id → name` map
   * (in-memory join) — this avoids a per-row Prisma join and keeps the shared `list` untouched.
   */
  async listBoard(
    filters: BoardFilters = {},
    viewer: TenantContext,
    opts: { includeTerminal?: boolean } = {},
  ): Promise<BoardResponse> {
    const now = new Date();
    const shared = { ...toRepoFilters(filters, viewer), now };
    const take = BOARD_PAGE + 1;
    const focus = filters.status; // a status filter narrows the board to that single column

    // One filtered groupBy (TRUE per-column totals) + two targeted counts (meta.overdue/stuck,
    // NOT a full scan) + N indexed per-column keyset reads, all parallelized. When `focus` is set
    // only its column query actually runs (the rest resolve to empty), per the design.
    const [grouped, overdueCount, stuckCount, clientNames, rulesRows, columnRows, terminalRows] =
      await Promise.all([
        candidateRepository.groupByStatusFiltered(viewer, shared),
        candidateRepository.count(viewer, { ...shared, overdue: true }),
        candidateRepository.count(viewer, { ...shared, stuck: true }),
        cachedClientNameMap(viewer),
        cachedClientRulesList(viewer),
        Promise.all(
          ACTIVE_STATUS_CODES.map((status) =>
            !focus || focus === status
              ? candidateRepository.listCards(viewer, {
                  ...shared,
                  status,
                  orderBy: "createdAt_desc",
                  take,
                })
              : Promise.resolve([] as CandidateCardRow[]),
          ),
        ),
        Promise.all(
          TERMINAL_STATUS_CODES.map((status) =>
            opts.includeTerminal
              ? candidateRepository.listCards(viewer, {
                  ...shared,
                  status,
                  orderBy: "createdAt_desc",
                  take,
                })
              : Promise.resolve([] as CandidateCardRow[]),
          ),
        ),
      ]);

    const rulesByClient = buildRulesMap(clientNames, rulesRows);
    const cardOf = (row: CandidateCardRow) =>
      toCard(
        row,
        clientNames,
        now,
        scoreFor(row, rulesByClient, now),
        dqFor(row, rulesByClient, now),
      );

    const countByStatus = new Map<string, number>();
    for (const g of grouped) countByStatus.set(g.status, g._count._all);
    let total = 0;
    let active = 0;
    for (const [status, n] of countByStatus) {
      total += n;
      if (isCandidateStatus(status) && !isTerminalStatus(status)) active += n;
    }

    // Project one keyset page per column: slice BOARD_PAGE, derive hasMore + per-column cursor.
    const paginate = (rows: CandidateCardRow[]) => {
      const hasMore = rows.length > BOARD_PAGE;
      const pageRows = hasMore ? rows.slice(0, BOARD_PAGE) : rows;
      const last = pageRows.at(-1);
      return {
        candidates: pageRows.map(cardOf),
        hasMore,
        nextCursor: hasMore && last ? encodeCursor(last, "createdAt_desc") : null,
      };
    };

    const columns = ACTIVE_STATUS_CODES.map((status, i) => ({
      status,
      label: statusLabel(status),
      stageOrder: statusOrder(status),
      count: countByStatus.get(status) ?? 0,
      ...paginate(columnRows[i] ?? []),
    }));

    const terminal = TERMINAL_STATUS_CODES.map((status, i) => {
      const count = countByStatus.get(status) ?? 0;
      if (!opts.includeTerminal) return { status, label: statusLabel(status), count };
      return { status, label: statusLabel(status), count, ...paginate(terminalRows[i] ?? []) };
    });

    return {
      columns,
      terminal,
      meta: { total, active, overdue: overdueCount, stuck: stuckCount },
    };
  },

  /**
   * Load ONE more page of a single board column (the per-column "Load more" — SP-2/§6.1). Reuses
   * the same shared filters + keyset read as `listBoard`, scoped to `status` and walked from
   * `cursor`. Cursors encode the immutable `createdAt`, so a board move elsewhere never invalidates
   * this column's cursor. Returns a `ColumnPageDTO` the client appends to that column's cards.
   */
  async listColumn(
    status: CandidateStatus,
    filters: BoardFilters = {},
    viewer: TenantContext,
    cursor?: PageCursor,
  ): Promise<ColumnPageDTO> {
    const now = new Date();
    const shared = { ...toRepoFilters(filters, viewer), now };
    const [rows, clientNames, rulesRows] = await Promise.all([
      candidateRepository.listCards(viewer, {
        ...shared,
        status,
        orderBy: "createdAt_desc",
        ...(cursor !== undefined && { cursor }),
        take: BOARD_PAGE + 1,
      }),
      cachedClientNameMap(viewer),
      cachedClientRulesList(viewer),
    ]);
    const rulesByClient = buildRulesMap(clientNames, rulesRows);
    const hasMore = rows.length > BOARD_PAGE;
    const pageRows = hasMore ? rows.slice(0, BOARD_PAGE) : rows;
    const items = pageRows.map((row) =>
      toCard(
        row,
        clientNames,
        now,
        scoreFor(row, rulesByClient, now),
        dqFor(row, rulesByClient, now),
      ),
    );
    const last = pageRows.at(-1);
    const nextCursor = hasMore && last ? encodeCursor(last, "createdAt_desc") : null;
    return { status, items, nextCursor, hasMore };
  },

  /**
   * Move many candidates INTO `toStatus`. Partial success, NO gate bypass: each id runs the same
   * server-authoritative `move` (gate → txn update + stage_history + audit) in ITS OWN
   * transaction, so one blocked (or missing) candidate never rolls back the valid moves. Gate
   * blocks and not-found land in `blocked` with the reason string; anything unexpected re-throws.
   */
  async bulkMove(
    ids: string[],
    toStatus: CandidateStatus,
    ctx: TenantContext,
  ): Promise<BulkMoveResponse> {
    const moved: string[] = [];
    const blocked: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await candidateService.move(id, toStatus, ctx);
        moved.push(id);
      } catch (err) {
        // Expected per-candidate outcomes (gate block, not found, unknown status) are collected,
        // not thrown — a bulk sweep must not lose the valid moves. Unexpected errors bubble up.
        if (
          err instanceof AppError &&
          (err.code === "STAGE_BLOCKED" || err.code === "NOT_FOUND" || err.code === "BAD_REQUEST")
        ) {
          blocked.push({ id, reason: err.message });
        } else {
          throw err;
        }
      }
    }
    return { moved, blocked };
  },

  /**
   * Move a candidate INTO `toStatus`. Server-authoritative: every transition (single drag AND
   * bulk) runs the stage gate. On success, atomically (1) updates the candidate's denormalized
   * pipeline columns, (2) appends a `stage_history` row, and (3) writes the audit entry — all in
   * one transaction so the trail can never drift from the data.
   */
  async move(
    id: string,
    toStatus: CandidateStatus,
    ctx: TenantContext,
    clock: Clock = systemClock,
  ) {
    // Defense-in-depth: `toStatus` is typed, but at a route boundary it's whatever the client
    // sent. Reject an unknown code before it reaches `statusOrder()` (which would throw on undefined).
    if (!isCandidateStatus(toStatus)) {
      throw new AppError("BAD_REQUEST", `Unknown pipeline status: ${toStatus}`);
    }
    const existing = await candidateRepository.findById(ctx, id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");

    const now = clock.now();
    const blocking = checkStageGate(toRuleCandidate(existing), toStatus, now);
    if (blocking.length > 0) {
      throw new AppError("STAGE_BLOCKED", blocking.join("; "));
    }

    const toStageOrder = statusOrder(toStatus);
    // placedAt is set once, the first time the candidate reaches "Started (Day 1)".
    const placedAt = toStatus === "STARTED_DAY1" ? (existing.placedAt ?? now) : existing.placedAt;

    return withTenantTransaction(ctx, async (tx) => {
      const updated = await candidateRepository.update(
        ctx,
        id,
        { status: toStatus, stageOrder: toStageOrder, stageEnteredAt: now, placedAt },
        tx,
      );
      await stageHistoryRepository.add(
        ctx,
        {
          candidateId: id,
          fromStatus: existing.status,
          toStatus,
          fromStageOrder: existing.stageOrder,
          toStageOrder,
          actorId: ctx.user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: ctx.user.id,
        action: "move",
        before: { status: existing.status, stageOrder: existing.stageOrder },
        after: { status: toStatus, stageOrder: toStageOrder },
      });
      return updated;
    });
  },
};
