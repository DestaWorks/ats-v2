import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import {
  markMentionReadSchema,
  type MentionListDTO,
  type MentionUnreadDTO,
} from "@destaworks/contracts/validation/mention";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { MENTION_SERVICE } from "./mentions.tokens";

/**
 * The session user's @-mentions and the badge count that goes with them.
 *
 * The recipient is ALWAYS the session — there is deliberately no recipient parameter on either
 * route, because the legacy backend let any caller read anyone's mentions by email. Recipient
 * scoping stays the service's job so the read and the mark-read cannot disagree about it.
 */
@Controller("mentions")
@UseGuards(SessionAuthGuard)
export class MentionsController {
  constructor(
    @Inject(MENTION_SERVICE) private readonly mentions: ServiceOf<typeof MENTION_SERVICE>,
  ) {}

  @Get()
  async listMine(@CurrentUser() user: AuthContext): Promise<MentionListDTO> {
    return await this.mentions.listMine(user);
  }

  /** 200, not Nest's POST default of 201: marking read creates nothing. */
  @Post("read")
  @HttpCode(200)
  async markRead(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(markMentionReadSchema))
    body: ContractOutput<typeof markMentionReadSchema>,
  ): Promise<MentionUnreadDTO> {
    return await this.mentions.markRead(body, user);
  }
}
