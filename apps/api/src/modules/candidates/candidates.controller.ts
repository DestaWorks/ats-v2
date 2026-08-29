import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  addNoteSchema,
  createCandidateSchema,
  updateCandidateSchema,
  uploadCandidateResumeSchema,
  verifyLicenseSchema,
} from "@destaworks/contracts/validation/candidate";
import {
  boardQuerySchema,
  bulkMoveInputSchema,
  listQuerySchema,
  moveInputSchema,
} from "@destaworks/contracts/validation/pipeline";
import { logOutreachSchema } from "@destaworks/contracts/validation/lead";
import { decodeCursor } from "@destaworks/contracts/validation/cursor";
import { hasCapability } from "@destaworks/domain/constants";
import { defined } from "@destaworks/domain/utils/defined";
import { toIso } from "@destaworks/domain/utils/iso";
import { AppError } from "@destaworks/integrations/http/app-error";
import { toCandidateDTO, toDocumentSummaryDTO } from "@destaworks/application/candidate.dto";
import type { AuthContext } from "@destaworks/auth/guards";
import type {
  CandidateListDTO,
  CandidateTrashDTO,
} from "@destaworks/contracts/validation/candidate";
import type { JourneyDTO } from "@destaworks/contracts/validation/journey";
import type {
  BoardResponse,
  BulkMoveResponse,
  ColumnPageDTO,
  DashboardStatsDTO,
} from "@destaworks/contracts/validation/pipeline";
import type {
  CandidateAckEnvelope,
  CandidateProfileEnvelope,
  DocumentSummaryEnvelope,
  MovedCandidateEnvelope,
  NoteEnvelope,
  NoteListEnvelope,
  OutreachAttemptEnvelope,
} from "@destaworks/contracts/validation/envelopes";
import type { CandidateEnvelope } from "@destaworks/application/candidate.wire";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { flatQuery } from "../../common/query-params";
import type { ServiceOf } from "../service-token";
import { RESUME_SERVICE } from "../resume/resume.tokens";
import { CANDIDATE_SERVICE, NOTE_SERVICE } from "./candidates.tokens";

/** `GET /candidates` answers one of two shapes behind one path — see `list()`. */
export type BoardOrColumnPage = BoardResponse | ColumnPageDTO;

/**
 * Candidates — the pipeline's central entity: the board read, the flat browse list, and every
 * mutation an operator performs on one candidate.
 *
 * Authorization matches the routes this replaces: working the pipeline is open to any signed-in
 * user (`SessionAuthGuard`), and exactly one endpoint is capability-gated — `purge`, which is
 * irreversible. `RateLimitGuard` is listed at the controller so it runs AFTER authentication and
 * keys per user; it is a no-op on the handlers that declare no `@RateLimit`.
 *
 * THE PII BOUNDARY runs through this file. Every candidate that reaches a client leaves through
 * `toCandidateDTO(row, viewer)`, which omits `licenseNumber` — key absent, never null — unless the
 * viewer holds `viewCredentials`. The three endpoints that can WRITE that field additionally refuse
 * a viewer without the capability with a 403, which is defence in depth over the DTO gate rather
 * than a substitute for it: a controller that assembled a response any other way would silently
 * bypass the omission.
 */
@Controller("candidates")
@UseGuards(SessionAuthGuard, RateLimitGuard)
export class CandidatesController {
  constructor(
    @Inject(CANDIDATE_SERVICE)
    private readonly candidates: ServiceOf<typeof CANDIDATE_SERVICE>,
    @Inject(NOTE_SERVICE)
    private readonly notes: ServiceOf<typeof NOTE_SERVICE>,
    @Inject(RESUME_SERVICE)
    private readonly resumes: ServiceOf<typeof RESUME_SERVICE>,
  ) {}

  /**
   * GET /candidates — the funnel-grouped board, or ONE column's next page when `column=` is set.
   *
   * Two endpoints behind one path, and the shape is what the client already depends on, so it is
   * preserved exactly. What Nest lets us make honest is the branch itself: the two outcomes are
   * separate, individually typed private methods, and this handler only decides which one applies.
   * The union is therefore declared in one place instead of being implied by two `json<T>()` calls.
   *
   * `mine` is a presence flag — the SERVICE resolves `createdById` from the viewer, so a
   * client-supplied user id is never trusted.
   */
  @Get()
  async list(
    @Query(flatQuery, new ZodValidationPipe(boardQuerySchema))
    query: ContractOutput<typeof boardQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<BoardOrColumnPage> {
    const { includeTerminal, column, cursor, ...filters } = query;
    return column === undefined
      ? this.readBoard(filters, includeTerminal, user)
      : this.readColumn(column, cursor, filters, user);
  }

  /**
   * POST /candidates — manually create a candidate. `createCandidateSchema` is strict, so a
   * status / pipeline-timing / licence-verification key is a 422: every interactive create starts at
   * stage 0, which the service forces. `licenseNumber` is accepted only from a viewer holding
   * `viewCredentials` (mirrors `update`).
   */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createCandidateSchema))
    body: ContractOutput<typeof createCandidateSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateEnvelope> {
    this.assertMayWriteLicenseNumber(body.licenseNumber, user, "set");
    const created = await this.candidates.create(defined(body));
    return { candidate: toCandidateDTO(created, user) };
  }

  /**
   * GET /candidates/list — one OFFSET page of the flat browse list. Declared before `:id` so the
   * literal segment wins the match; Nest resolves routes in declaration order.
   */
  @Get("list")
  async browse(
    @Query(flatQuery, new ZodValidationPipe(listQuerySchema))
    query: ContractOutput<typeof listQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateListDTO> {
    return this.candidates.listCandidates(defined(query), user);
  }

  /**
   * POST /candidates/bulk-move — move many candidates at once. No gate bypass: the service runs the
   * same server-authoritative `move` for every id, each in its own transaction, and answers with a
   * partial-success summary so one blocked candidate never rolls back the valid moves.
   */
  @Post("bulk-move")
  @HttpCode(200)
  async bulkMove(
    @Body(new ZodValidationPipe(bulkMoveInputSchema))
    body: ContractOutput<typeof bulkMoveInputSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<BulkMoveResponse> {
    return this.candidates.bulkMove(body.ids, body.toStatus, user);
  }

  /**
   * GET /candidates/trash — the `/trash` payload, soft-deleted candidates newest-deleted first.
   * Declared before `:id` so the literal segment wins the match; Nest resolves in declaration order.
   *
   * Open to any signed-in operator, matching the page it serves: soft-delete and restore are
   * reversible, and the rows are PII-gated by `toCandidateDTO` inside the service — a trash row
   * never carries `licenseNumber`. Purging is the gated action, and it lives on its own endpoint.
   */
  @Get("trash")
  async trash(@CurrentUser() user: AuthContext): Promise<CandidateTrashDTO> {
    return this.candidates.listTrash(user);
  }

  /**
   * GET /candidates/dashboard-stats — headline counts, the active-stage funnel and the small
   * "needs attention" list. Declared before `:id` for the same reason as `trash`.
   */
  @Get("dashboard-stats")
  async dashboardStats(@CurrentUser() user: AuthContext): Promise<DashboardStatsDTO> {
    return this.candidates.dashboardStats(user);
  }

  /**
   * GET /candidates/:id — the lighter profile projection the recipient picker fetches after a pick.
   * Not the detail composite the RSC page loads: no documents, notes, history or outreach.
   */
  @Get(":id")
  async profile(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateProfileEnvelope> {
    return { candidate: await this.candidates.getProfile(id, user) };
  }

  /**
   * PATCH /candidates/:id — edit profile fields. `updateCandidateSchema` is strict, so status and
   * pipeline timing (owned by `move` and `verifyLicense`) are a 422 rather than a silent no-op.
   * `licenseNumber` is refused with a 403 for a viewer without `viewCredentials`.
   */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCandidateSchema))
    body: ContractOutput<typeof updateCandidateSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateEnvelope> {
    this.assertMayWriteLicenseNumber(body.licenseNumber, user, "edit");
    const updated = await this.candidates.update(id, body, user);
    return { candidate: toCandidateDTO(updated, user) };
  }

  /**
   * DELETE /candidates/:id — soft-delete to Trash. Reversible, so open to any operator; the service
   * self-gates. Answers with the id only, never the candidate.
   */
  @Delete(":id")
  async softDelete(@Param("id") id: string): Promise<CandidateAckEnvelope> {
    await this.candidates.softDelete(id);
    return { ok: true, id };
  }

  /** GET /candidates/:id/journey — the full oldest-first timeline, notes scoped to the viewer. */
  @Get(":id/journey")
  async journey(@Param("id") id: string, @CurrentUser() user: AuthContext): Promise<JourneyDTO> {
    return this.candidates.getJourney(id, user);
  }

  /**
   * POST /candidates/:id/move — one server-authoritative move. The service runs the stage gate and
   * updates candidate + stage history + audit atomically; a blocked gate surfaces as 422.
   */
  @Post(":id/move")
  @HttpCode(200)
  async move(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(moveInputSchema)) body: ContractOutput<typeof moveInputSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<MovedCandidateEnvelope> {
    const updated = await this.candidates.move(id, body.toStatus, user);
    return {
      candidate: {
        id: updated.id,
        status: updated.status,
        stageOrder: updated.stageOrder,
        stageEnteredAt: toIso(updated.stageEnteredAt),
      },
    };
  }

  /**
   * GET /candidates/:id/notes — the candidate's notes, scoped SERVER-side by `visibleNotes`. The
   * legacy shipped hidden notes to the browser and filtered there; this never sends them.
   */
  @Get(":id/notes")
  async listNotes(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<NoteListEnvelope> {
    return { notes: await this.notes.listByCandidate(user, id) };
  }

  /**
   * POST /candidates/:id/notes — add a note. Author comes from the session, never the body. The
   * text is stored raw; the XSS defence is at render, in escaped React children.
   */
  @Post(":id/notes")
  async addNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addNoteSchema)) body: ContractOutput<typeof addNoteSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<NoteEnvelope> {
    return { note: await this.notes.add(user, id, body) };
  }

  /** POST /candidates/:id/outreach — log one attempt; the lead-side twin is `/leads/:id/outreach`. */
  @Post(":id/outreach")
  async logOutreach(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(logOutreachSchema)) body: ContractOutput<typeof logOutreachSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<OutreachAttemptEnvelope> {
    return { attempt: await this.candidates.logOutreach(id, body, user) };
  }

  /**
   * POST /candidates/:id/purge — PERMANENTLY delete a trashed candidate, cascading its documents,
   * notes and stage history. Irreversible, so it is the one capability-gated endpoint here; the
   * service re-checks the capability and enforces the two-step gate (409 on a candidate still live).
   */
  @Post(":id/purge")
  @HttpCode(200)
  @UseGuards(CapabilityGuard)
  @RequireCapability("purgeCandidate")
  async purge(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateAckEnvelope> {
    await this.candidates.purge(id, user);
    return { ok: true, id };
  }

  /** POST /candidates/:id/restore — bring a trashed candidate back into its existing stage. */
  @Post(":id/restore")
  @HttpCode(200)
  async restore(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateEnvelope> {
    const restored = await this.candidates.restore(id, user);
    return { candidate: toCandidateDTO(restored, user) };
  }

  /**
   * POST /candidates/:id/resume — attach a resume to this already-known candidate, with no AI
   * extraction or matching (that is the separate `/resume/*` flow). Rate limited because a real
   * Storage call may already have backed the upload.
   */
  @Post(":id/resume")
  @RateLimit({ name: "candidate-resume-upload", limit: 20, windowMs: 60_000 })
  async attachResume(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(uploadCandidateResumeSchema))
    body: ContractOutput<typeof uploadCandidateResumeSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<DocumentSummaryEnvelope> {
    const document = await this.resumes.attachToCandidate(user, id, body);
    return { document: toDocumentSummaryDTO(document) };
  }

  /**
   * POST /candidates/:id/verify-license — record a licence verification. Open to operators by
   * design (D-6): licence status drives the stage gates, so Screeners and Associates — who hold no
   * capabilities — must be able to unblock the pipeline. Writing `licenseNumber` in the same call
   * still requires `viewCredentials`.
   */
  @Post(":id/verify-license")
  @HttpCode(200)
  async verifyLicense(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(verifyLicenseSchema))
    body: ContractOutput<typeof verifyLicenseSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<CandidateEnvelope> {
    this.assertMayWriteLicenseNumber(body.licenseNumber, user, "edit");
    const updated = await this.candidates.verifyLicense(id, body, user);
    return { candidate: toCandidateDTO(updated, user) };
  }

  /**
   * The write half of the PII boundary, shared by the three endpoints that accept `licenseNumber`.
   * `toCandidateDTO` already withholds the field on the way out; this refuses to let a viewer who
   * cannot read it write it, so the capability governs both directions rather than one.
   */
  private assertMayWriteLicenseNumber(
    licenseNumber: string | null | undefined,
    user: AuthContext,
    verb: "set" | "edit",
  ): void {
    if (licenseNumber === undefined) return;
    if (hasCapability(user.role, "viewCredentials")) return;
    throw new AppError("FORBIDDEN", `You don't have permission to ${verb} the license number`);
  }

  /** The whole board: active columns, terminal lists and the header counts. */
  private async readBoard(
    filters: BoardFilters,
    includeTerminal: boolean,
    user: AuthContext,
  ): Promise<BoardResponse> {
    return this.candidates.listBoard(defined(filters), user, defined({ includeTerminal }));
  }

  /** One column's next keyset page. A malformed cursor is the client's error, so 400 — not 500. */
  private async readColumn(
    column: BoardColumn,
    cursor: string | undefined,
    filters: BoardFilters,
    user: AuthContext,
  ): Promise<ColumnPageDTO> {
    let decoded;
    if (cursor) {
      decoded = decodeCursor(cursor, "createdAt_desc");
      if (!decoded) throw new AppError("BAD_REQUEST", "Invalid cursor");
    }
    return this.candidates.listColumn(column, defined(filters), user, decoded);
  }
}

type BoardQuery = ContractOutput<typeof boardQuerySchema>;

/** The paginatable column `column=` names — the schema's own union, never a restated one. */
type BoardColumn = NonNullable<BoardQuery["column"]>;

/** Everything in the board query that is a FILTER, i.e. not the mode switch or the pagination. */
type BoardFilters = Omit<BoardQuery, "includeTerminal" | "column" | "cursor">;
