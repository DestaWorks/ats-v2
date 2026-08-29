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
  addRoleNoteSchema,
  createOpenRoleSchema,
  parseJdSchema,
  promoteFromMatchSchema,
  roleListQuerySchema,
  updateOpenRoleSchema,
  type DeleteRoleNoteResponse,
  type DeleteRoleResponse,
  type GetRoleDormantMatchesResponse,
  type GetRoleListResponse,
  type GetRoleMatchesAndDormantResponse,
  type GetRoleMatchesResponse,
  type GetRoleResponse,
  type GetRoleTriageResponse,
  type PatchRoleResponse,
  type PostRoleNoteResponse,
  type PostRoleParseJdResponse,
  type PostRolePromoteResponse,
  type PostRoleResponse,
} from "@destaworks/contracts/validation/open-role";
import { defined } from "@destaworks/domain/utils/defined";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { OPEN_ROLE_SERVICE } from "./roles.tokens";

/**
 * Open Roles, ported from `apps/web/src/app/api/roles/**` — the client-side demand the matcher
 * ranks leads against.
 *
 * Authorization is `requireUser()` for the area, with ONE exception carried over verbatim:
 * `DELETE /roles/:id` is a hard delete with no undo, so it is gated on `deleteOpenRole` the way the
 * equally irreversible candidate purge is. The capability guard is stacked on that one method, and
 * the class declares no capability of its own — which is why the other methods reach their handler
 * through `SessionAuthGuard` alone rather than being refused by a class-level gate.
 */
@Controller("roles")
@UseGuards(SessionAuthGuard)
export class RolesController {
  constructor(
    @Inject(OPEN_ROLE_SERVICE) private readonly roles: ServiceOf<typeof OPEN_ROLE_SERVICE>,
  ) {}

  /** POST /roles — add an Open Role. 201; a create always starts at "Open". */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createOpenRoleSchema))
    body: ContractOutput<typeof createOpenRoleSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostRoleResponse> {
    return { role: await this.roles.create(body, user) };
  }

  /** GET /roles — one OFFSET page of the role inventory. */
  @Get()
  async list(
    @Query(new ZodValidationPipe(roleListQuerySchema))
    query: ContractOutput<typeof roleListQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<GetRoleListResponse> {
    return await this.roles.list(defined(query), user);
  }

  /** GET /roles/triage — the top 3 roles to work now. Declared before `:id` so it matches. */
  @Get("triage")
  async triage(@CurrentUser() user: AuthContext): Promise<GetRoleTriageResponse> {
    return { roles: await this.roles.triage(user) };
  }

  /**
   * POST /roles/parse-jd — paste a job description, AI extracts the fields.
   *
   * Rate-limited per user because every call is a paid model request; the bucket name and limits
   * are the ones the Next.js route built by hand, moved onto the decorator the shared limiter reads.
   */
  @Post("parse-jd")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "roles-parse-jd", limit: 20, windowMs: 60_000 })
  async parseJd(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(parseJdSchema)) body: ContractOutput<typeof parseJdSchema>,
  ): Promise<PostRoleParseJdResponse> {
    return await this.roles.parseJd(user, body);
  }

  /** GET /roles/:id — one role's detail, notes included. */
  @Get(":id")
  async detail(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetRoleResponse> {
    return { role: await this.roles.detail(id, user) };
  }

  /** PATCH /roles/:id — any field, `status` included; the service stamps/clears `closedAt`. */
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOpenRoleSchema))
    body: ContractOutput<typeof updateOpenRoleSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PatchRoleResponse> {
    return { role: await this.roles.update(id, body, user) };
  }

  /** DELETE /roles/:id — HARD delete, no undo. The one route in this area with a capability gate. */
  @Delete(":id")
  @UseGuards(CapabilityGuard)
  @RequireCapability("deleteOpenRole")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteRoleResponse> {
    return await this.roles.remove(id, user);
  }

  /** POST /roles/:id/promote — fill the role from a matched lead; the role's status is not flipped. */
  @Post(":id/promote")
  @HttpCode(HttpStatus.OK)
  async promote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(promoteFromMatchSchema))
    body: ContractOutput<typeof promoteFromMatchSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostRolePromoteResponse> {
    return await this.roles.promote(id, body, user);
  }

  /** GET /roles/:id/matches — the active matcher's ranked leads, client-tunable weights. */
  @Get(":id/matches")
  async matches(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetRoleMatchesResponse> {
    return { matches: await this.roles.matches(id, user) };
  }

  /** GET /roles/:id/dormant-matches — fixed-weight re-engagement candidates. */
  @Get(":id/dormant-matches")
  async dormantMatches(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetRoleDormantMatchesResponse> {
    return { matches: await this.roles.dormantMatches(id, user) };
  }

  /**
   * GET /roles/:id/matches-and-dormant — both ranked lists in ONE request.
   *
   * The `/roles/[id]` page needs both, and the service computes them from a single lead fetch. Two
   * separate calls would undo that and add a second network hop for the same data, so the composite
   * read gets a composite endpoint (SAAS-RESTRUCTURE-PLAN 4.0). Declared after `:id/matches` and
   * `:id/dormant-matches`, which stay for callers that want only one list.
   */
  @Get(":id/matches-and-dormant")
  async matchesAndDormant(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<GetRoleMatchesAndDormantResponse> {
    return await this.roles.matchesAndDormant(id, user);
  }

  /** POST /roles/:id/notes — add a note; author comes from the session, never the body. 201. */
  @Post(":id/notes")
  async addNote(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addRoleNoteSchema)) body: ContractOutput<typeof addRoleNoteSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostRoleNoteResponse> {
    return { role: await this.roles.addNote(id, body, user) };
  }

  /** DELETE /roles/:id/notes/:noteId — soft-delete one note, scoped to its role. */
  @Delete(":id/notes/:noteId")
  async deleteNote(
    @Param("id") id: string,
    @Param("noteId") noteId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteRoleNoteResponse> {
    return { role: await this.roles.deleteNote(id, noteId, user) };
  }
}
