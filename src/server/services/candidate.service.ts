import "server-only";
import {
  ACTIVE_STATUS_CODES,
  TERMINAL_STATUS_CODES,
  hasCapability,
  isCandidateStatus,
  isTerminalStatus,
  statusLabel,
  statusOrder,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import type {
  CandidateDetailDTO,
  UpdateCandidateInput,
  VerifyLicenseInput,
} from "@/lib/validation/candidate";
import type { CandidateListDTO, CandidateListItemDTO } from "@/lib/validation/candidate";
import type {
  BoardResponse,
  BulkMoveResponse,
  CandidateCardDTO,
  ColumnPageDTO,
  DashboardStatsDTO,
} from "@/lib/validation/pipeline";
import { encodeCursor, type ListOrderBy, type PageCursor } from "@/lib/validation/cursor";
import { requireUser, type AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository, type CandidateRow } from "@/server/repositories/candidate.repository";
import { clientRepository, type ClientRow } from "@/server/repositories/client.repository";
import {
  clientRulesRepository,
  toClientRules,
  type ClientRulesRow,
} from "@/server/repositories/client-rules.repository";
import { documentRepository } from "@/server/repositories/document.repository";
import { noteRepository } from "@/server/repositories/note.repository";
import { stageHistoryRepository } from "@/server/repositories/stage-history.repository";
import { checkStageGate } from "@/lib/rules/stage-gates";
import { scoreCandidate } from "@/lib/rules/scoring";
import { getAutoDisqualify } from "@/lib/rules/disqualify";
import type { ClientRules } from "@/lib/rules/types";
import { getDaysInStage, isOverdue, isStuck } from "@/lib/rules/stage-timing";
import { AppError } from "@/server/http/app-error";
import { visibleNotes, toNoteDTO } from "./note.service";
import { toDocumentDTO } from "./document.dto";
import {
  toCandidateDTO,
  toCandidateProfileDTO,
  toDocumentSummaryDTO,
  toRuleCandidate,
  toStageEventDTO,
} from "./candidate.dto";

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
  /** "My candidates" — translated to `createdById === viewer.id` by the service. */
  mine?: boolean;
  overdue?: boolean;
  stuck?: boolean;
}

/** Filters accepted by the board read. `status` narrows the board to a single-column focus. */
export interface BoardFilters extends SharedListFilters {
  status?: CandidateStatus;
}

/** Filters accepted by the flat list read — the shared set + a DB sort + a keyset cursor. */
export interface ListFilters extends SharedListFilters {
  status?: CandidateStatus;
  /** DB-backed sort (default `createdAt_desc` = Newest first). Score is NOT a paginate key. */
  sort?: ListOrderBy;
  cursor?: PageCursor;
}

/**
 * Translate the service-level shared filters into repository filters — resolving `mine` to the
 * viewer's id server-side (the ONLY place `createdById` is set from a session, never the client).
 * `status` is threaded through separately by each caller (the list keeps it; the board strips it).
 */
function toRepoFilters(filters: SharedListFilters, viewer: AuthUser) {
  return {
    track: filters.track,
    clientId: filters.clientId,
    search: filters.search,
    tags: filters.tags,
    licenseStatus: filters.licenseStatus,
    createdById: filters.mine ? viewer.id : undefined,
    overdue: filters.overdue,
    stuck: filters.stuck,
  };
}

/**
 * Page size for the `/candidates` browse read — one keyset page of the flat table (OQ-5). The read
 * fetches `LIST_PAGE + 1` rows to detect `hasMore`; the DTO carries `nextCursor`/`hasMore`/`total`
 * so the UI can "Load more" through the whole (filtered) set instead of hitting an unreachable cap.
 */
const LIST_PAGE = 50;

/**
 * Per-column page size for the board (OQ-5). Each active column ships one keyset page of at most
 * this many CARDS with its own `nextCursor`/`hasMore`; the column header still shows the TRUE total
 * (from the filtered `groupBy`). A "Load more" appends the next `ColumnPageDTO` to that column.
 */
const BOARD_PAGE = 25;

/** How many "needs attention" candidates the dashboard surfaces (a small, targeted read). */
const ATTENTION_LIMIT = 8;

/**
 * Build the `clientId → ClientRules` map the scorer consumes, joining the small `client_rules` table
 * to the `clients` name map ONCE per read (mirrors the `clientId → name` map already built). A rules
 * row whose client is absent (e.g. soft-deleted) is skipped — an orphan can't be scored/named.
 * `priority` / `autoDisqualify` are dropped here (not part of the scoring interface — see
 * `toClientRules`); `getCandidateDetail` reads them separately from the row when it needs the DQ list.
 */
function buildRulesMap(
  clients: ClientRow[],
  rulesRows: ClientRulesRow[],
): Map<string, ClientRules> {
  const nameById = new Map(clients.map((c) => [c.id, c.name] as const));
  const out = new Map<string, ClientRules>();
  for (const r of rulesRows) {
    const name = nameById.get(r.clientId);
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
function scoreFor(row: CandidateRow, rulesByClient: Map<string, ClientRules>): number | null {
  if (!row.clientId) return null;
  const rules = rulesByClient.get(row.clientId);
  if (!rules || constrainsNothing(rules)) return null;
  const { pct, max } = scoreCandidate(toRuleCandidate(row), rules);
  return max > 0 ? pct : null;
}

/**
 * Project a raw candidate row onto the client-safe `CandidateCardDTO`. Runs through
 * `toCandidateDTO` first (the PII boundary) — the card type omits `licenseNumber` entirely, so
 * it can never reach a card regardless of viewer role. Timing is derived from `stageEnteredAt`;
 * `score` (the precomputed fit `pct`, or `null`) is passed in by the service.
 */
function toCard(
  row: CandidateRow,
  viewer: AuthUser,
  clientNames: Map<string, string>,
  now: Date,
  score: number | null,
): CandidateCardDTO {
  const dto = toCandidateDTO(row, viewer);
  const status = dto.status as CandidateStatus;
  return {
    id: dto.id,
    name: dto.name,
    track: dto.track as Track,
    credential: dto.credential,
    licenseState: dto.licenseState,
    licenseStatus: dto.licenseStatus as LicenseStatus,
    clientId: dto.clientId,
    clientName: dto.clientId ? (clientNames.get(dto.clientId) ?? null) : null,
    status,
    stageOrder: dto.stageOrder,
    daysInStage: getDaysInStage(dto.stageEnteredAt, now),
    isOverdue: isOverdue(status, dto.stageEnteredAt, now),
    isStuck: isStuck(dto.stageEnteredAt, now),
    score,
  };
}

/**
 * Project a raw candidate row onto the PII-gated `CandidateListItemDTO` for the browse list. Runs
 * through `toCandidateDTO` first (the PII boundary) — the list item type omits `licenseNumber`
 * entirely, so it can never reach a row. `clientName` is resolved from the batch-loaded client map.
 */
function toListItem(
  row: CandidateRow,
  viewer: AuthUser,
  clientNames: Map<string, string>,
  now: Date,
  score: number | null,
): CandidateListItemDTO {
  const dto = toCandidateDTO(row, viewer);
  const status = dto.status as CandidateStatus;
  return {
    id: dto.id,
    name: dto.name,
    credential: dto.credential,
    track: dto.track,
    clientName: dto.clientId ? (clientNames.get(dto.clientId) ?? null) : null,
    status,
    statusLabel: statusLabel(status),
    licenseStatus: dto.licenseStatus,
    daysInStage: getDaysInStage(dto.stageEnteredAt, now),
    score,
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
 * `move` receives the already-authenticated `AuthUser` from its caller (the drag / bulk-move
 * handler). Hard purge — the capability-gated (`purgeCandidate`) destructive path — lands in
 * Wave 2.5, separate from this soft delete.
 */
export const candidateService = {
  async create(input: CandidateCreateInput) {
    const user = await requireUser();
    // Every interactive create starts New (stage 0). No status arg → no gate bypass.
    return candidateRepository.create({
      ...input,
      status: "NEW_CANDIDATE",
      stageOrder: statusOrder("NEW_CANDIDATE"),
      createdById: user.id,
    });
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
  async update(id: string, input: UpdateCandidateInput, user: AuthUser) {
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return withTransaction(async (tx) => {
      const updated = await candidateRepository.update(id, input, tx);
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.id,
        action: "update",
        before: pickAudited(existing, input),
        after: pickAudited(updated, input),
      });
      return updated;
    });
  },

  async softDelete(id: string) {
    const user = await requireUser();
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    return candidateRepository.softDelete(id, user.id);
  },

  /**
   * Read one candidate's full profile — the single composite the detail page needs (candidate +
   * documents + role-scoped notes + recent stage history + clientName), in one `CandidateDetailDTO`.
   * The RSC calls this DIRECTLY (no self-fetch); authZ is the caller's (`getCurrentUser()`), and
   * `viewer` drives the PII gate. Every PII boundary is REUSED, not re-implemented: `toCandidateDTO`
   * omits `licenseNumber`, `toDocumentDTO` omits `extractedText`/`extractedData`, both unless the
   * viewer holds `viewCredentials`; note visibility is `visibleNotes` (server-side, §3.2).
   */
  async getCandidateDetail(id: string, viewer: AuthUser): Promise<CandidateDetailDTO> {
    const candidate = await candidateRepository.findById(id);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");

    const [documents, notes, history, clients, rulesRows] = await Promise.all([
      documentRepository.listByCandidate(id),
      noteRepository.listByCandidate(id),
      stageHistoryRepository.listByCandidate(id),
      clientRepository.list(),
      clientRulesRepository.list(),
    ]);

    const clientName = candidate.clientId
      ? (new Map(clients.map((c) => [c.id, c.name])).get(candidate.clientId) ?? null)
      : null;

    // Scoring block (S-4/S-7): compute the fit + flags for the assigned client and the ADVISORY
    // auto-DQ reasons. `null` when there's nothing to score against (no client / no rules / max 0).
    // Auto-DQ is display-only — it NEVER mutates the candidate's status (that stays a human `move`).
    const rulesByClient = buildRulesMap(clients, rulesRows);
    const rules = candidate.clientId ? (rulesByClient.get(candidate.clientId) ?? null) : null;
    const ruleCandidate = toRuleCandidate(candidate);
    const raw = scoreCandidate(ruleCandidate, rules);
    // Non-null only when the client constrains at least one matchable dimension (see `scoreFor`) —
    // a constrains-nothing client offers no client-specific fit to explain.
    const scoring =
      rules && !constrainsNothing(rules) && raw.max > 0
        ? {
            pct: raw.pct,
            score: raw.score,
            max: raw.max,
            flags: raw.flags,
            autoDisqualify: getAutoDisqualify(ruleCandidate, rules),
          }
        : null;

    return {
      candidate: toCandidateProfileDTO(toCandidateDTO(candidate, viewer)),
      clientName,
      documents: documents.map((d) => toDocumentSummaryDTO(toDocumentDTO(d, viewer))),
      notes: visibleNotes(notes, viewer).map(toNoteDTO),
      stageHistory: history.slice(0, 10).map(toStageEventDTO),
      canVerifyCredentials: hasCapability(viewer.role, "viewCredentials"),
      scoring,
    };
  },

  /**
   * Verify a candidate's license — sets `licenseStatus` (+ optional `licenseExpiry`/`licenseNumber`)
   * and stamps WHO/WHEN (`licenseVerifiedById`/`licenseVerifiedAt`). License status DRIVES the stage
   * gates (INITIAL_SCREENING needs verified, SUBMITTED needs `Active`), so this is a load-bearing
   * pipeline action — OPEN TO OPERATORS (`requireUser` at the route), matching legacy. Writing
   * `licenseNumber` still requires `viewCredentials` (enforced at the route, design D-6). The update
   * + audit run in one transaction.
   */
  async verifyLicense(id: string, input: VerifyLicenseInput, user: AuthUser) {
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");
    const now = new Date();
    return withTransaction(async (tx) => {
      const updated = await candidateRepository.update(
        id,
        {
          licenseStatus: input.licenseStatus,
          ...(input.licenseExpiry !== undefined ? { licenseExpiry: input.licenseExpiry } : {}),
          ...(input.licenseNumber !== undefined ? { licenseNumber: input.licenseNumber } : {}),
          licenseVerifiedAt: now,
          licenseVerifiedById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.id,
        action: "verify_license",
        before: { licenseStatus: existing.licenseStatus, licenseExpiry: existing.licenseExpiry },
        after: { licenseStatus: updated.licenseStatus, licenseExpiry: updated.licenseExpiry },
      });
      return updated;
    });
  },

  /**
   * Read the `/candidates` browse list — a flat, PII-gated, CURSOR-PAGINATED table (distinct from
   * the funnel board). AuthZ is the caller's (RSC `getCurrentUser()` / route `requireUser()`);
   * `viewer` drives the PII gate (`toCandidateDTO` omits `licenseNumber`) AND resolves `mine`.
   *
   * Pagination: fetches `LIST_PAGE + 1` rows so `hasMore` is exact, ordered by a DB field (default
   * `createdAt desc`). There is DELIBERATELY NO global score sort — score is computed + returned per
   * row (a displayed column), but the page ORDER is the DB order; a page-local "fit" re-order is a
   * UI concern. `total` is a true filtered count for an honest "Showing N of M". `clientName` is
   * resolved via a one-shot in-memory join over the small `clients` table (as `listBoard` does).
   */
  async listCandidates(filters: ListFilters = {}, viewer: AuthUser): Promise<CandidateListDTO> {
    const now = new Date();
    const orderBy: ListOrderBy = filters.sort ?? "createdAt_desc";
    const repoFilters = { ...toRepoFilters(filters, viewer), status: filters.status };
    const [rows, total, clients, rulesRows] = await Promise.all([
      candidateRepository.list({
        ...repoFilters,
        cursor: filters.cursor,
        orderBy,
        take: LIST_PAGE + 1,
        now,
      }),
      candidateRepository.count({ ...repoFilters, now }),
      clientRepository.list(),
      clientRulesRepository.list(),
    ]);
    const hasMore = rows.length > LIST_PAGE;
    const page = hasMore ? rows.slice(0, LIST_PAGE) : rows;
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const rulesByClient = buildRulesMap(clients, rulesRows);
    const candidates = page.map((row) =>
      toListItem(row, viewer, clientNames, now, scoreFor(row, rulesByClient)),
    );
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!, orderBy) : null;
    return { candidates, count: candidates.length, capped: hasMore, hasMore, nextCursor, total };
  },

  /**
   * Dashboard summary WITHOUT loading the whole candidate table (audit perf finding). Per-status
   * counts come from a Prisma `groupBy` (the funnel + total/active/terminal); the "needs attention"
   * list is a SMALL targeted read of the oldest-in-stage active candidates (`take: ATTENTION_LIMIT`)
   * filtered to those actually overdue/stuck. AuthZ is the caller's; `viewer` drives the card PII gate.
   */
  async dashboardStats(viewer: AuthUser): Promise<DashboardStatsDTO> {
    const [grouped, staleRows, clients, rulesRows] = await Promise.all([
      candidateRepository.groupByStatus(),
      candidateRepository.listStaleActive(ATTENTION_LIMIT),
      clientRepository.list(),
      clientRulesRepository.list(),
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

    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const rulesByClient = buildRulesMap(clients, rulesRows);
    const now = new Date();
    const attention = staleRows
      .map((row) => toCard(row, viewer, clientNames, now, scoreFor(row, rulesByClient)))
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
    viewer: AuthUser,
    opts: { includeTerminal?: boolean } = {},
  ): Promise<BoardResponse> {
    const now = new Date();
    const shared = { ...toRepoFilters(filters, viewer), now };
    const take = BOARD_PAGE + 1;
    const focus = filters.status; // a status filter narrows the board to that single column

    // One filtered groupBy (TRUE per-column totals) + two targeted counts (meta.overdue/stuck,
    // NOT a full scan) + N indexed per-column keyset reads, all parallelized. When `focus` is set
    // only its column query actually runs (the rest resolve to empty), per the design.
    const [grouped, overdueCount, stuckCount, clients, rulesRows, columnRows, terminalRows] =
      await Promise.all([
        candidateRepository.groupByStatusFiltered(shared),
        candidateRepository.count({ ...shared, overdue: true }),
        candidateRepository.count({ ...shared, stuck: true }),
        clientRepository.list(),
        clientRulesRepository.list(),
        Promise.all(
          ACTIVE_STATUS_CODES.map((status) =>
            !focus || focus === status
              ? candidateRepository.list({ ...shared, status, orderBy: "createdAt_desc", take })
              : Promise.resolve([] as CandidateRow[]),
          ),
        ),
        Promise.all(
          TERMINAL_STATUS_CODES.map((status) =>
            opts.includeTerminal
              ? candidateRepository.list({ ...shared, status, orderBy: "createdAt_desc", take })
              : Promise.resolve([] as CandidateRow[]),
          ),
        ),
      ]);

    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const rulesByClient = buildRulesMap(clients, rulesRows);
    const cardOf = (row: CandidateRow) =>
      toCard(row, viewer, clientNames, now, scoreFor(row, rulesByClient));

    const countByStatus = new Map<string, number>();
    for (const g of grouped) countByStatus.set(g.status, g._count._all);
    let total = 0;
    let active = 0;
    for (const [status, n] of countByStatus) {
      total += n;
      if (isCandidateStatus(status) && !isTerminalStatus(status)) active += n;
    }

    // Project one keyset page per column: slice BOARD_PAGE, derive hasMore + per-column cursor.
    const paginate = (rows: CandidateRow[]) => {
      const hasMore = rows.length > BOARD_PAGE;
      const pageRows = hasMore ? rows.slice(0, BOARD_PAGE) : rows;
      return {
        candidates: pageRows.map(cardOf),
        hasMore,
        nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]!, "createdAt_desc") : null,
      };
    };

    const columns = ACTIVE_STATUS_CODES.map((status, i) => ({
      status,
      label: statusLabel(status),
      stageOrder: statusOrder(status),
      count: countByStatus.get(status) ?? 0,
      ...paginate(columnRows[i]!),
    }));

    const terminal = TERMINAL_STATUS_CODES.map((status, i) => {
      const count = countByStatus.get(status) ?? 0;
      if (!opts.includeTerminal) return { status, label: statusLabel(status), count };
      return { status, label: statusLabel(status), count, ...paginate(terminalRows[i]!) };
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
    viewer: AuthUser,
    cursor?: PageCursor,
  ): Promise<ColumnPageDTO> {
    const now = new Date();
    const shared = { ...toRepoFilters(filters, viewer), now };
    const [rows, clients, rulesRows] = await Promise.all([
      candidateRepository.list({
        ...shared,
        status,
        orderBy: "createdAt_desc",
        cursor,
        take: BOARD_PAGE + 1,
      }),
      clientRepository.list(),
      clientRulesRepository.list(),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const rulesByClient = buildRulesMap(clients, rulesRows);
    const hasMore = rows.length > BOARD_PAGE;
    const pageRows = hasMore ? rows.slice(0, BOARD_PAGE) : rows;
    const items = pageRows.map((row) =>
      toCard(row, viewer, clientNames, now, scoreFor(row, rulesByClient)),
    );
    const nextCursor = hasMore
      ? encodeCursor(pageRows[pageRows.length - 1]!, "createdAt_desc")
      : null;
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
    user: AuthUser,
  ): Promise<BulkMoveResponse> {
    const moved: string[] = [];
    const blocked: { id: string; reason: string }[] = [];
    for (const id of ids) {
      try {
        await candidateService.move(id, toStatus, user);
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
  async move(id: string, toStatus: CandidateStatus, user: AuthUser) {
    // Defense-in-depth: `toStatus` is typed, but at a route boundary it's whatever the client
    // sent. Reject an unknown code before it reaches `statusOrder()` (which would throw on undefined).
    if (!isCandidateStatus(toStatus)) {
      throw new AppError("BAD_REQUEST", `Unknown pipeline status: ${toStatus}`);
    }
    const existing = await candidateRepository.findById(id);
    if (!existing) throw new AppError("NOT_FOUND", "Candidate not found");

    const blocking = checkStageGate(toRuleCandidate(existing), toStatus);
    if (blocking.length > 0) {
      throw new AppError("STAGE_BLOCKED", blocking.join("; "));
    }

    const now = new Date();
    const toStageOrder = statusOrder(toStatus);
    // placedAt is set once, the first time the candidate reaches "Started (Day 1)".
    const placedAt = toStatus === "STARTED_DAY1" ? (existing.placedAt ?? now) : existing.placedAt;

    return withTransaction(async (tx) => {
      const updated = await candidateRepository.update(
        id,
        { status: toStatus, stageOrder: toStageOrder, stageEnteredAt: now, placedAt },
        tx,
      );
      await stageHistoryRepository.add(
        {
          candidateId: id,
          fromStatus: existing.status,
          toStatus,
          fromStageOrder: existing.stageOrder,
          toStageOrder,
          actorId: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: id,
        actor: user.id,
        action: "move",
        before: { status: existing.status, stageOrder: existing.stageOrder },
        after: { status: toStatus, stageOrder: toStageOrder },
      });
      return updated;
    });
  },
};
