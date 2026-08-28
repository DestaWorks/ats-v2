import { Body, Controller, Delete, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { addContactSchema, updateContactSchema } from "@destaworks/contracts/validation/client";
import type {
  DeleteCrmClientContactResponse,
  PatchCrmClientContactResponse,
  PostCrmClientContactResponse,
} from "@destaworks/contracts/http/crm";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { CLIENT_SERVICE } from "./crm.tokens";

/**
 * The people at a client. Both ids stay in the path and are both passed to the service, which is
 * what makes a contact belonging to another client a 404 rather than a cross-client edit.
 */
@Controller("crm/clients/:id/contacts")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmClientContactsController {
  constructor(
    @Inject(CLIENT_SERVICE)
    private readonly clients: ServiceOf<typeof CLIENT_SERVICE>,
  ) {}

  @Post()
  async add(
    @Param("id") clientId: string,
    @Body(new ZodValidationPipe(addContactSchema))
    body: ContractOutput<typeof addContactSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PostCrmClientContactResponse> {
    return { contact: await this.clients.addContact(clientId, body, user) };
  }

  @Patch(":contactId")
  async update(
    @Param("id") clientId: string,
    @Param("contactId") contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema))
    body: ContractOutput<typeof updateContactSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PatchCrmClientContactResponse> {
    return { contact: await this.clients.updateContact(clientId, contactId, body, user) };
  }

  @Delete(":contactId")
  async remove(
    @Param("id") clientId: string,
    @Param("contactId") contactId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DeleteCrmClientContactResponse> {
    await this.clients.removeContact(clientId, contactId, user);
    return { ok: true, id: contactId };
  }
}
