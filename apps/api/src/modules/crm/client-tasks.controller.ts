import { Body, Controller, Delete, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { addTaskSchema, updateTaskSchema } from "@destaworks/contracts/validation/client";
import type {
  DeleteCrmClientTaskResponse,
  PatchCrmClientTaskResponse,
  PostCrmClientTaskResponse,
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
 * Follow-up tasks against a client. Completing one is the same PATCH as editing it — the caller
 * sends `status` and the service stamps or clears `completedAt`, so completion time is never a
 * value the client supplies.
 */
@Controller("crm/clients/:id/tasks")
@UseGuards(SessionAuthGuard, CapabilityGuard)
@RequireCapability("viewCrm")
export class CrmClientTasksController {
  constructor(
    @Inject(CLIENT_SERVICE)
    private readonly clients: ServiceOf<typeof CLIENT_SERVICE>,
  ) {}

  @Post()
  async add(
    @Param("id") clientId: string,
    @Body(new ZodValidationPipe(addTaskSchema))
    body: ContractOutput<typeof addTaskSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostCrmClientTaskResponse> {
    return { task: await this.clients.addTask(clientId, body, user) };
  }

  @Patch(":taskId")
  async update(
    @Param("id") clientId: string,
    @Param("taskId") taskId: string,
    @Body(new ZodValidationPipe(updateTaskSchema))
    body: ContractOutput<typeof updateTaskSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PatchCrmClientTaskResponse> {
    return { task: await this.clients.updateTask(clientId, taskId, body, user) };
  }

  @Delete(":taskId")
  async remove(
    @Param("id") clientId: string,
    @Param("taskId") taskId: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteCrmClientTaskResponse> {
    await this.clients.removeTask(clientId, taskId, user);
    return { ok: true, id: taskId };
  }
}
