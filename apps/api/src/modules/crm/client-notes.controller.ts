import { Body, Controller, Get, Inject, Param, Post, UseGuards } from "@nestjs/common";
import { createClientNoteSchema } from "@destaworks/contracts/validation/client-note";
import type {
  GetCrmClientNotesResponse,
  PostCrmClientNoteResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { CLIENT_NOTE_SERVICE } from "./crm.tokens";

/**
 * The manual call/note log against a client — its own service because a note is append-only
 * narrative, not a field of the client record.
 */
@Controller("crm/clients/:id/notes")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmClientNotesController {
  constructor(
    @Inject(CLIENT_NOTE_SERVICE)
    private readonly notes: ServiceOf<typeof CLIENT_NOTE_SERVICE>,
  ) {}

  @Get()
  async list(@Param("id") clientId: string): Promise<GetCrmClientNotesResponse> {
    return { notes: await this.notes.list(clientId) };
  }

  @Post()
  async create(
    @Param("id") clientId: string,
    @Body(new ZodValidationPipe(createClientNoteSchema))
    body: ContractOutput<typeof createClientNoteSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostCrmClientNoteResponse> {
    return { note: await this.notes.create(clientId, body, user) };
  }
}
