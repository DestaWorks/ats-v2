import { Body, Controller, Get, HttpCode, Inject, Patch, Post, UseGuards } from "@nestjs/common";
import {
  updateLearnProgressSchema,
  type LearnProgressDTO,
} from "@destaworks/contracts/validation/learn";
import {
  updatePreferencesSchema,
  uploadAvatarSchema,
  type AvatarUploadedDTO,
  type UserPreferencesDTO,
} from "@destaworks/contracts/validation/user-preferences";
import type { SessionUserDTO } from "@destaworks/contracts/validation/auth";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { LEARN_SERVICE, USER_PREFERENCES_SERVICE } from "./account.tokens";

/**
 * The signed-in operator's own record — identity, UI preferences, avatar and Learn progress.
 *
 * Every route here is "me" and only "me": there is no id parameter to widen, and the user comes
 * from the session the guard resolved rather than from anything the caller sent. That is why none
 * of them declares a capability — the authorization question is "are you signed in?", and
 * administering somebody ELSE's account is `AdminModule`, gated `manageUsers`.
 */
@Controller("me")
@UseGuards(SessionAuthGuard)
export class MeController {
  constructor(
    @Inject(USER_PREFERENCES_SERVICE)
    private readonly preferences: ServiceOf<typeof USER_PREFERENCES_SERVICE>,
    @Inject(LEARN_SERVICE) private readonly learn: ServiceOf<typeof LEARN_SERVICE>,
  ) {}

  /** The current authenticated user — identity and role, nothing else off the session record. */
  @Get()
  me(@CurrentUser() user: AuthUser): SessionUserDTO {
    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  @Get("preferences")
  async getPreferences(@CurrentUser() user: AuthUser): Promise<UserPreferencesDTO> {
    return await this.preferences.getMine(user);
  }

  @Patch("preferences")
  async updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema))
    body: ContractOutput<typeof updatePreferencesSchema>,
  ): Promise<UserPreferencesDTO> {
    return await this.preferences.updateMine(user, body);
  }

  /** 200, not Nest's POST default of 201: the avatar replaces one that already existed. */
  @Post("avatar")
  @HttpCode(200)
  async uploadAvatar(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(uploadAvatarSchema))
    body: ContractOutput<typeof uploadAvatarSchema>,
  ): Promise<AvatarUploadedDTO> {
    return await this.preferences.uploadAvatar(user, body);
  }

  @Get("learn-progress")
  async getLearnProgress(@CurrentUser() user: AuthUser): Promise<LearnProgressDTO> {
    return await this.learn.getMine(user);
  }

  @Patch("learn-progress")
  async updateLearnProgress(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateLearnProgressSchema))
    body: ContractOutput<typeof updateLearnProgressSchema>,
  ): Promise<LearnProgressDTO> {
    return await this.learn.setChapter(user, body.chapterId, body.done);
  }
}
