import { Body, Controller, Delete, Get, Inject, Param, Put, UseGuards } from "@nestjs/common";
import { saveMatchProfileSchema } from "@destaworks/contracts/validation/open-role";
import type {
  DeleteClientMatchProfileResponse,
  GetClientMatchProfileResponse,
  PutClientMatchProfileResponse,
} from "@destaworks/contracts/http/open-role";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { OPEN_ROLE_SERVICE } from "./roles.tokens";

/**
 * The per-client weight overrides the active matcher scores candidates against (legacy `cp_save`).
 *
 * Authenticated only at the transport, deliberately: the leadership restriction on the two writes
 * is enforced inside `openRoleService`, which is also where the change is audited. Declaring a
 * capability here as well would put the same decision in two places, and the service's is the one
 * that cannot be bypassed by a caller that reaches it another way.
 */
@Controller("client-match-profiles")
@UseGuards(SessionAuthGuard)
export class ClientMatchProfilesController {
  constructor(
    @Inject(OPEN_ROLE_SERVICE)
    private readonly openRoles: ServiceOf<typeof OPEN_ROLE_SERVICE>,
  ) {}

  @Get(":clientId")
  async read(@Param("clientId") clientId: string): Promise<GetClientMatchProfileResponse> {
    return this.openRoles.getMatchProfile(clientId);
  }

  @Put(":clientId")
  async save(
    @Param("clientId") clientId: string,
    @Body(new ZodValidationPipe(saveMatchProfileSchema))
    body: ContractOutput<typeof saveMatchProfileSchema>,
    @CurrentUser() user: AuthUser,
  ): Promise<PutClientMatchProfileResponse> {
    return this.openRoles.saveMatchProfile(clientId, body, user);
  }

  @Delete(":clientId")
  async reset(
    @Param("clientId") clientId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DeleteClientMatchProfileResponse> {
    return this.openRoles.deleteMatchProfile(clientId, user);
  }
}
