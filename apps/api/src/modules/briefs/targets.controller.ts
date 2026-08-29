import { Body, Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import {
  suggestTargetsSchema,
  type TargetsSuggestAiOutput,
} from "@destaworks/contracts/validation/briefs";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { BRIEF_SERVICE } from "./briefs.tokens";

const suggestTargetsPipe = new ZodValidationPipe(suggestTargetsSchema);

/**
 * AI-suggested day targets for one associate, feeding the manager target-setting modal.
 *
 * A separate controller from `BriefsController` because it is a separate URL prefix, but the same
 * module and the same service: `/targets` and `/briefs` are one service boundary, and splitting
 * them into two modules would fork the wiring for no gain. The `viewReports` gate matches the
 * `SET_TARGETS_CAP` that `dailyService.setTarget` already enforces, so a manager who can suggest
 * targets is exactly the set who can set them.
 */
@Controller("targets")
@UseGuards(CapabilityGuard, RateLimitGuard)
@RequireCapability("viewReports")
export class TargetsController {
  constructor(@Inject(BRIEF_SERVICE) private readonly briefs: ServiceOf<typeof BRIEF_SERVICE>) {}

  /** POST /targets/suggest — a paid LLM call, so metered per user at the route's 20/min. */
  @Post("suggest")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "targets-suggest", limit: 20, windowMs: 60_000 })
  suggest(
    @Body(suggestTargetsPipe) body: ContractOutput<typeof suggestTargetsSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<TargetsSuggestAiOutput> {
    return this.briefs.suggestTargets(body, user);
  }
}
