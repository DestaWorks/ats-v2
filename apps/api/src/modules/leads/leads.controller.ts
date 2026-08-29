import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  addLeadSchema,
  bulkLeadActionSchema,
  importLeadsSchema,
  leadListQuerySchema,
  logOutreachSchema,
  respondSchema,
  snoozeLeadSchema,
  updateOutreachSchema,
  type DeleteLeadOutreachAttemptResponse,
  type DeleteLeadResponse,
  type GetLeadListResponse,
  type GetLeadResponse,
  type PatchLeadOutreachAttemptResponse,
  type PostLeadBulkResponse,
  type PostLeadImportResponse,
  type PostLeadOutreachResponse,
  type PostLeadPromoteResponse,
  type PostLeadRespondResponse,
  type PostLeadRestoreResponse,
  type PostLeadResponse,
  type PostLeadSnoozeResponse,
} from "@destaworks/contracts/validation/lead";
import { defined } from "@destaworks/domain/utils/defined";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { LEAD_SERVICE } from "./leads.tokens";

/**
 * Source Leads — the pre-pipeline sourcing lifecycle, ported from `apps/web/src/app/api/leads/**`.
 *
 * Transport only: every method parses its input against the contract schema, delegates to
 * `leadService`, and returns the service's answer in the contract's envelope. The lifecycle rules
 * that make this surface safe — a Promoted lead is terminal, a soft-deleted one is invisible to the
 * inventory, an outreach edit never moves the status — live in the service and are not restated.
 *
 * Authorization is `requireUser()` for the whole area, matching the routes it replaces: sourcing is
 * open to any signed-in operator (L-7), and no lead field is `licenseNumber`-class PII, so there is
 * no per-field capability gate to apply. The guard is declared on the controller so a route added
 * later inherits it rather than shipping unguarded.
 */
@Controller("leads")
@UseGuards(SessionAuthGuard)
export class LeadsController {
  constructor(@Inject(LEAD_SERVICE) private readonly leads: ServiceOf<typeof LEAD_SERVICE>) {}

  /** POST /leads — add a source lead. 201; the service forces the starting status. */
  @Post()
  async create(
    @Body(new ZodValidationPipe(addLeadSchema)) body: ContractOutput<typeof addLeadSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadResponse> {
    return { lead: await this.leads.create(body, user) };
  }

  /**
   * GET /leads/list — one OFFSET page of the `/sourcing` inventory.
   *
   * Declared before `GET /leads/:id`: Nest matches in declaration order, and `list` would otherwise
   * be swallowed as an id.
   */
  @Get("list")
  async list(
    @Query(new ZodValidationPipe(leadListQuerySchema))
    query: ContractOutput<typeof leadListQuerySchema>,
  ): Promise<GetLeadListResponse> {
    const { deleted, ...filters } = query;
    return await this.leads.list(defined({ ...filters, includeDeleted: deleted }));
  }

  /** POST /leads/bulk — delete · restore · status · assign · client · outreach over <=200 ids. */
  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  async bulk(
    @Body(new ZodValidationPipe(bulkLeadActionSchema))
    body: ContractOutput<typeof bulkLeadActionSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadBulkResponse> {
    return await this.leads.bulkAction(body, user);
  }

  /** POST /leads/import — one <=200-row chunk of the CSV import; dedup is server-side. */
  @Post("import")
  @HttpCode(HttpStatus.OK)
  async import(
    @Body(new ZodValidationPipe(importLeadsSchema)) body: ContractOutput<typeof importLeadsSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadImportResponse> {
    return await this.leads.importLeads(body, user);
  }

  /** GET /leads/:id — full detail, soft-deleted leads included so the trash view can inspect them. */
  @Get(":id")
  async detail(@Param("id") id: string): Promise<GetLeadResponse> {
    return { lead: await this.leads.detail(id) };
  }

  /** DELETE /leads/:id — soft-delete. Answers with the id alone, never the lead. */
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteLeadResponse> {
    const { id: deleted } = await this.leads.softDelete(id, user);
    return { ok: true, id: deleted };
  }

  /** POST /leads/:id/promote — into the candidate pipeline. Terminal: a second call is a 409. */
  @Post(":id/promote")
  @HttpCode(HttpStatus.OK)
  async promote(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadPromoteResponse> {
    return await this.leads.promote(id, user);
  }

  /** POST /leads/:id/respond — mark Responded Hot or Cold. */
  @Post(":id/respond")
  @HttpCode(HttpStatus.OK)
  async respond(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(respondSchema)) body: ContractOutput<typeof respondSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadRespondResponse> {
    return { lead: await this.leads.respond(id, body.kind, user) };
  }

  /** POST /leads/:id/snooze — snooze until a date, or wake with `{ until: null }`. */
  @Post(":id/snooze")
  @HttpCode(HttpStatus.OK)
  async snooze(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(snoozeLeadSchema)) body: ContractOutput<typeof snoozeLeadSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadSnoozeResponse> {
    return { lead: await this.leads.snooze(id, body.until, user) };
  }

  /** POST /leads/:id/restore — undo a soft delete. Status and outreach history are untouched. */
  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadRestoreResponse> {
    return { lead: await this.leads.restore(id, user) };
  }

  /** POST /leads/:id/outreach — log an attempt; the service advances the outreach stage. */
  @Post(":id/outreach")
  @HttpCode(HttpStatus.OK)
  async logOutreach(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(logOutreachSchema)) body: ContractOutput<typeof logOutreachSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostLeadOutreachResponse> {
    return { lead: await this.leads.logOutreach(id, body, user) };
  }

  /** PATCH /leads/:id/outreach/:attemptId — edit one logged attempt; never moves the status. */
  @Patch(":id/outreach/:attemptId")
  async updateOutreach(
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @Body(new ZodValidationPipe(updateOutreachSchema))
    body: ContractOutput<typeof updateOutreachSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PatchLeadOutreachAttemptResponse> {
    return { lead: await this.leads.updateOutreach(id, attemptId, body, user) };
  }

  /** DELETE /leads/:id/outreach/:attemptId — the counts re-sync; the status is not regressed. */
  @Delete(":id/outreach/:attemptId")
  async deleteOutreach(
    @Param("id") id: string,
    @Param("attemptId") attemptId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteLeadOutreachAttemptResponse> {
    return { lead: await this.leads.deleteOutreach(id, attemptId, user) };
  }
}
