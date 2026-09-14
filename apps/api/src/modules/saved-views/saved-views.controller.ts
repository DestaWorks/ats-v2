import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  createSavedViewSchema,
  savedViewListQuerySchema,
} from "@destaworks/contracts/validation/saved-view";
import type {
  DeleteSavedViewResponse,
  GetSavedViewsResponse,
  PostSavedViewResponse,
} from "@destaworks/contracts/http/saved-view";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { SAVED_VIEW_SERVICE } from "./saved-views.tokens";

/**
 * A user's own saved filter state. Every handler is authenticated but ungated by capability: a
 * saved view is private to the caller, so the authorization is the `user` argument the service
 * filters on, not a role. Nothing here reads an owner from the request.
 */
@Controller("saved-views")
@UseGuards(SessionAuthGuard)
export class SavedViewsController {
  constructor(
    @Inject(SAVED_VIEW_SERVICE)
    private readonly savedViews: ServiceOf<typeof SAVED_VIEW_SERVICE>,
  ) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(savedViewListQuerySchema))
    query: ContractOutput<typeof savedViewListQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<GetSavedViewsResponse> {
    return { savedViews: await this.savedViews.list(query.scope, user) };
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createSavedViewSchema))
    body: ContractOutput<typeof createSavedViewSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<PostSavedViewResponse> {
    return { savedView: await this.savedViews.create(body, user) };
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<DeleteSavedViewResponse> {
    return this.savedViews.remove(id, user);
  }
}
