import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { saveScreeningSchema } from "@destaworks/contracts/validation/screening";
import type {
  ScreeningCandidateListEnvelope,
  ScreeningScorecardEnvelope,
} from "@destaworks/contracts/validation/envelopes";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { flatQuery, type FlatQuery } from "../../common/query-params";
import type { ServiceOf } from "../service-token";
import { SCREENING_SERVICE } from "./screening.tokens";

/**
 * Screening — the first human gate in the pipeline: pick a candidate, score them, and optionally
 * advance them in the same call. Open to any signed-in operator, matching `POST /candidates/:id/move`.
 */
@Controller("screening")
@UseGuards(SessionAuthGuard)
export class ScreeningController {
  constructor(
    @Inject(SCREENING_SERVICE) private readonly screening: ServiceOf<typeof SCREENING_SERVICE>,
  ) {}

  /**
   * GET /screening/candidates — the picker's list, scoped to the three eligible stages. Declared
   * before `:candidateId` so the literal segment wins; Nest matches in declaration order.
   *
   * `search` is trimmed and an empty string becomes "no filter", which is what the route it replaces
   * does — a blank search box must not be a search for the empty string.
   */
  @Get("candidates")
  async pickerCandidates(
    @Query(flatQuery) query: FlatQuery,
  ): Promise<ScreeningCandidateListEnvelope> {
    const term = query["search"]?.trim() || undefined;
    return { candidates: await this.screening.listEligibleCandidates(term) };
  }

  /**
   * POST /screening/:candidateId — persist the scorecard, then attempt the stage move `action`
   * implies. The order is load-bearing: the scorecard is saved BEFORE the move is tried, so a
   * blocked gate (422) never loses the recruiter's scoring work.
   */
  @Post(":candidateId")
  @HttpCode(200)
  async save(
    @Param("candidateId") candidateId: string,
    @Body(new ZodValidationPipe(saveScreeningSchema))
    body: ContractOutput<typeof saveScreeningSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<ScreeningScorecardEnvelope> {
    return { scorecard: await this.screening.saveAndMaybeMove(candidateId, body, user) };
  }
}
