import { Controller, HttpCode, HttpStatus, Inject, Post, UseGuards } from "@nestjs/common";
import type { PostPipelineHealthResponse } from "@destaworks/contracts/validation/pipeline-health";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { PIPELINE_HEALTH_SERVICE } from "./pipeline.tokens";
import type { ServiceOf } from "../service-token";

/**
 * The AI Pipeline Health strip, ported from `apps/web/src/app/api/pipeline/health`.
 *
 * Team-wide and unfiltered by design — the pipeline is core, so it is open to every signed-in
 * operator with no capability gate, exactly as the route it replaces. It takes no body: the strip
 * summarises the whole pipeline, and accepting a filter would let a caller shape a paid model call.
 */
@Controller("pipeline")
@UseGuards(SessionAuthGuard)
export class PipelineController {
  constructor(
    @Inject(PIPELINE_HEALTH_SERVICE)
    private readonly pipelineHealth: ServiceOf<typeof PIPELINE_HEALTH_SERVICE>,
  ) {}

  /** POST /pipeline/health — rate-limited per user; every call is a paid model request. */
  @Post("health")
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ name: "pipeline-health", limit: 20, windowMs: 60_000 })
  async health(@CurrentUser() user: AuthContext): Promise<PostPipelineHealthResponse> {
    return await this.pipelineHealth.generate(user);
  }
}
