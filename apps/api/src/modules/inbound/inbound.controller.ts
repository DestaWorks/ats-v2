import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import {
  attachInboundSchema,
  saveInboundLeadSchema,
  triageSchema,
  type PostInboundAttachResponse,
  type PostInboundSaveResponse,
  type PostInboundTriageResponse,
} from "@destaworks/contracts/validation/inbound";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { INBOUND_SERVICE } from "./inbound.tokens";
import type { ServiceOf } from "../service-token";

/**
 * Inbound Triage, ported from `apps/web/src/app/api/inbound/**` — a pasted reply becomes either a
 * new Source Lead or an outreach attempt on an existing one, with a reviewer in between.
 *
 * `requireUser()` for the area (sourcing is open to any operator, L-7). Only `triage` is rate
 * limited, and only because it is the one that spends money on a model call — attach and save are
 * ordinary writes and were never limited by the routes they replace.
 */
@Controller("inbound")
@UseGuards(SessionAuthGuard)
export class InboundController {
  constructor(
    @Inject(INBOUND_SERVICE) private readonly inbound: ServiceOf<typeof INBOUND_SERVICE>,
  ) {}

  /**
   * POST /inbound/triage — extract, dedupe and client-match a pasted reply. Read-only: nothing is
   * created, so the reviewer can discard the result.
   */
  @Post("triage")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "inbound-triage", limit: 20, windowMs: 60_000 })
  async triage(
    @Body(new ZodValidationPipe(triageSchema)) body: ContractOutput<typeof triageSchema>,
  ): Promise<PostInboundTriageResponse> {
    return await this.inbound.triage(body);
  }

  /** POST /inbound/attach — the reply belongs to an existing lead: log it and mark Responded Hot. */
  @Post("attach")
  @HttpCode(HttpStatus.OK)
  async attach(
    @Body(new ZodValidationPipe(attachInboundSchema))
    body: ContractOutput<typeof attachInboundSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostInboundAttachResponse> {
    return { lead: await this.inbound.attach(body, user) };
  }

  /** POST /inbound/save — save the reviewed extraction as a fresh Responded Hot lead. 201. */
  @Post("save")
  async save(
    @Body(new ZodValidationPipe(saveInboundLeadSchema))
    body: ContractOutput<typeof saveInboundLeadSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostInboundSaveResponse> {
    return { lead: await this.inbound.saveAsLead(body, user) };
  }
}
