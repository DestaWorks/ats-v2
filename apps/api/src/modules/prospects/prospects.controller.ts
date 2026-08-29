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
  addProspectContactSchema,
  addProspectSchema,
  addProspectsFromSearchSchema,
  bulkProspectActionSchema,
  prospectListQuerySchema,
  searchProspectsSchema,
  updateProspectSchema,
  type DeleteProspectContactResponse,
  type DeleteProspectResponse,
  type GetProspectListResponse,
  type GetProspectResponse,
  type GetProspectSearchResponse,
  type PatchProspectResponse,
  type PostProspectBulkAddResponse,
  type PostProspectBulkResponse,
  type PostProspectContactResponse,
  type PostProspectEnrichHunterResponse,
  type PostProspectEnrichResponse,
  type PostProspectResponse,
  type PostProspectRestoreResponse,
} from "@destaworks/contracts/validation/prospect";
import { defined } from "@destaworks/domain/utils/defined";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { flatQuery } from "../../common/query-params";
import type { ServiceOf } from "../service-token";
import { PROSPECT_SERVICE } from "./prospects.tokens";

/**
 * Client Discovery prospects, ported from `apps/web/src/app/api/prospects/**`.
 *
 * Transport only: parse, delegate, return. The terminal-state rule (a converted "Client" prospect
 * refuses edits with a 409) and the ineligible-row skipping in the bulk dispatcher belong to the
 * service and are not restated here.
 *
 * Every route in the area needs the same capability, so `@RequireCapability` is declared ONCE on
 * the controller instead of thirteen times on its methods. That is not just brevity: a route added
 * to this class later is gated by construction, whereas a per-method list has to be remembered.
 */
@Controller("prospects")
@UseGuards(CapabilityGuard)
@RequireCapability("viewClientDiscovery")
export class ProspectsController {
  constructor(
    @Inject(PROSPECT_SERVICE) private readonly prospects: ServiceOf<typeof PROSPECT_SERVICE>,
  ) {}

  /** POST /prospects — add manually. 201; the service forces status "Fresh Lead" / source "Manual". */
  @Post()
  async create(
    @Body(new ZodValidationPipe(addProspectSchema)) body: ContractOutput<typeof addProspectSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectResponse> {
    return { prospect: await this.prospects.create(body, user) };
  }

  /** GET /prospects/list — one OFFSET page of the inventory. Declared before `:id` so it matches. */
  @Get("list")
  async list(
    @Query(new ZodValidationPipe(prospectListQuerySchema))
    query: ContractOutput<typeof prospectListQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<GetProspectListResponse> {
    const { deleted, ...filters } = query;
    return await this.prospects.list(defined({ ...filters, includeDeleted: deleted }), user);
  }

  /**
   * GET /prospects/search — the NPPES organisation search `/client-discovery/search` renders.
   *
   * Declared before `:id` or Nest would read "search" as a prospect id. The contract refines that
   * at least one of taxonomy/state/city/zip is present, which is what NPPES itself requires, so a
   * criteria-less query is a 422 here rather than an upstream error. Rate limiting stays in the
   * service, where the bucket key already is.
   */
  @Get("search")
  async search(
    @Query(flatQuery, new ZodValidationPipe(searchProspectsSchema))
    query: ContractOutput<typeof searchProspectsSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<GetProspectSearchResponse> {
    return await this.prospects.search(query, user);
  }

  /** POST /prospects/bulk — delete · restore · status · assign over <=200 ids. */
  @Post("bulk")
  @HttpCode(HttpStatus.OK)
  async bulk(
    @Body(new ZodValidationPipe(bulkProspectActionSchema))
    body: ContractOutput<typeof bulkProspectActionSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectBulkResponse> {
    return await this.prospects.bulkAction(body, user);
  }

  /** POST /prospects/bulk-add — add selected NPPES rows; the NPI dedupe set is re-derived server-side. */
  @Post("bulk-add")
  @HttpCode(HttpStatus.OK)
  async bulkAdd(
    @Body(new ZodValidationPipe(addProspectsFromSearchSchema))
    body: ContractOutput<typeof addProspectsFromSearchSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectBulkAddResponse> {
    return await this.prospects.addFromSearch(body, user);
  }

  /** GET /prospects/:id — detail with notes and contacts; soft-deleted rows are still inspectable. */
  @Get(":id")
  async detail(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetProspectResponse> {
    return { prospect: await this.prospects.detail(id, user) };
  }

  /** PATCH /prospects/:id — status/owner/notes/website. */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProspectSchema))
    body: ContractOutput<typeof updateProspectSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PatchProspectResponse> {
    return { prospect: await this.prospects.update(id, body, user) };
  }

  /** DELETE /prospects/:id — soft-delete. Answers with the id alone, never the prospect. */
  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteProspectResponse> {
    const { id: deleted } = await this.prospects.softDelete(id, user);
    return { ok: true, id: deleted };
  }

  /** POST /prospects/:id/contacts — add a contact by hand. 201. */
  @Post(":id/contacts")
  async addContact(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addProspectContactSchema))
    body: ContractOutput<typeof addProspectContactSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectContactResponse> {
    return { prospect: await this.prospects.addContactManual(id, body, user) };
  }

  /** DELETE /prospects/:id/contacts/:contactId — scoped to its prospect; a foreign id is a 404. */
  @Delete(":id/contacts/:contactId")
  async deleteContact(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteProspectContactResponse> {
    return { prospect: await this.prospects.deleteContact(id, contactId, user) };
  }

  /** POST /prospects/:id/enrich — Apollo contact discovery; 503 when the key is unconfigured. */
  @Post(":id/enrich")
  @HttpCode(HttpStatus.OK)
  async enrich(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectEnrichResponse> {
    return { prospect: await this.prospects.enrichContacts(id, user) };
  }

  /** POST /prospects/:id/enrich-hunter — the Hunter.io fallback; needs a website on file. */
  @Post(":id/enrich-hunter")
  @HttpCode(HttpStatus.OK)
  async enrichHunter(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectEnrichHunterResponse> {
    return { prospect: await this.prospects.findContactsHunter(id, user) };
  }

  /** POST /prospects/:id/restore — undo a soft delete; the status is untouched. */
  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<PostProspectRestoreResponse> {
    return { prospect: await this.prospects.restore(id, user) };
  }
}
