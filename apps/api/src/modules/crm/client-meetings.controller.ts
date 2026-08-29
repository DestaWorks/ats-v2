import { Body, Controller, Delete, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { addMeetingSchema } from "@destaworks/contracts/validation/client";
import type {
  DeleteCrmClientMeetingResponse,
  PostCrmClientMeetingResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { CLIENT_SERVICE } from "./crm.tokens";

/**
 * A meeting log. There is deliberately no edit verb — a logged meeting is a record of something
 * that happened, and legacy treated it as immutable; DELETE exists for a mis-log, nothing else.
 */
@Controller("crm/clients/:id/meetings")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmClientMeetingsController {
  constructor(
    @Inject(CLIENT_SERVICE)
    private readonly clients: ServiceOf<typeof CLIENT_SERVICE>,
  ) {}

  @Post()
  async add(
    @Param("id") clientId: string,
    @Body(new ZodValidationPipe(addMeetingSchema))
    body: ContractOutput<typeof addMeetingSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostCrmClientMeetingResponse> {
    return { meeting: await this.clients.addMeeting(clientId, body, user) };
  }

  @Delete(":meetingId")
  async remove(
    @Param("id") clientId: string,
    @Param("meetingId") meetingId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteCrmClientMeetingResponse> {
    await this.clients.removeMeeting(clientId, meetingId, user);
    return { ok: true, id: meetingId };
  }
}
