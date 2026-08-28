import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  generateDailyBriefRequestSchema,
  generateWeeklyBriefSchema,
  saveDailyBriefSchema,
  saveWeeklyBriefSchema,
  weeklyPatternsSchema,
  type DailyBriefAiOutput,
  type WeeklyBriefAiOutput,
  type WeeklyPatternsAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { mondayOf } from "@destaworks/domain/daily";
import type { AuthUser } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { HttpResponseLike } from "../../common/http";
import { resolveViewerTz, viewerDay } from "../../common/viewer-time";
import type { ServiceOf } from "../service-token";
import { BRIEF_SERVICE } from "./briefs.tokens";

const generateDailyPipe = new ZodValidationPipe(generateDailyBriefRequestSchema);
const saveDailyPipe = new ZodValidationPipe(saveDailyBriefSchema);
const generateWeeklyPipe = new ZodValidationPipe(generateWeeklyBriefSchema);
const saveWeeklyPipe = new ZodValidationPipe(saveWeeklyBriefSchema);
const weeklyPatternsPipe = new ZodValidationPipe(weeklyPatternsSchema);

/**
 * Write a body that may legitimately be `null`.
 *
 * Nest's Express adapter treats a `null` return as "no body" and answers an EMPTY response, while
 * `json(null)` in the Next.js route answers the four bytes `null`. A client calling `.json()` on
 * the empty one throws. The two nullable GETs here therefore write the body themselves, through
 * the structurally-typed `HttpResponseLike` so this file still takes no dependency on Express.
 */
function sendJson(response: HttpResponseLike, body: unknown): void {
  response.status(HttpStatus.OK);
  response.json(body);
}

/**
 * Daily and Weekly Briefs: read the saved one, generate an AI draft, persist the edited draft,
 * and the generate-only 4-week pattern scan.
 *
 * Every route is `viewReports` — these are team-wide AI reports, not personal data — so the
 * capability is declared once on the class. The three generate endpoints each make a paid LLM
 * call and carry their own `@RateLimit` bucket, matching the Next.js routes exactly.
 *
 * The two GETs resolve "today" from the VIEWER's timezone when no date is supplied; see
 * `common/viewer-time` for why the server's own day must never stand in for it.
 */
@Controller("briefs")
@UseGuards(CapabilityGuard, RateLimitGuard)
@RequireCapability("viewReports")
export class BriefsController {
  constructor(@Inject(BRIEF_SERVICE) private readonly briefs: ServiceOf<typeof BRIEF_SERVICE>) {}

  /** GET /briefs/daily?date=YYYY-MM-DD — the saved brief for that day, or `null`. */
  @Get("daily")
  async daily(@Query("date") date: string | undefined, @Res() response: HttpResponseLike) {
    const day = viewerDay(date, await resolveViewerTz());
    sendJson(response, await this.briefs.getDaily(day));
  }

  /** POST /briefs/daily/generate — assemble live context, call the AI, return an unsaved draft. */
  @Post("daily/generate")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "briefs-daily-generate", limit: 20, windowMs: 60_000 })
  generateDaily(
    @Body(generateDailyPipe) body: ContractOutput<typeof generateDailyBriefRequestSchema>,
  ): Promise<DailyBriefAiOutput> {
    return this.briefs.generateDaily(
      { date: body.date, tz: body.tz },
      {
        priorityClientId: body.priorityClientId ?? null,
        shiftA: body.shiftA ?? null,
        shiftB: body.shiftB ?? null,
        watchItems: body.watchItems ?? null,
      },
    );
  }

  /** POST /briefs/daily/save — persist the (possibly edited) draft. */
  @Post("daily/save")
  @HttpCode(HttpStatus.OK)
  saveDaily(
    @Body(saveDailyPipe) body: ContractOutput<typeof saveDailyBriefSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.briefs.saveDaily(body, user);
  }

  /** GET /briefs/weekly?weekStart=YYYY-MM-DD — the saved brief for that week, or `null`. */
  @Get("weekly")
  async weekly(
    @Query("weekStart") weekStart: string | undefined,
    @Res() response: HttpResponseLike,
  ) {
    const monday = mondayOf(viewerDay(weekStart, await resolveViewerTz()));
    sendJson(response, await this.briefs.getWeekly(monday));
  }

  /** POST /briefs/weekly/generate — assemble live context, call the AI, return an unsaved draft. */
  @Post("weekly/generate")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "briefs-weekly-generate", limit: 10, windowMs: 60_000 })
  generateWeekly(
    @Body(generateWeeklyPipe) body: ContractOutput<typeof generateWeeklyBriefSchema>,
  ): Promise<WeeklyBriefAiOutput> {
    return this.briefs.generateWeekly(body);
  }

  /** POST /briefs/weekly/save — persist the (possibly edited) draft. */
  @Post("weekly/save")
  @HttpCode(HttpStatus.OK)
  saveWeekly(
    @Body(saveWeeklyPipe) body: ContractOutput<typeof saveWeeklyBriefSchema>,
    @CurrentUser() user: AuthUser,
  ) {
    return this.briefs.saveWeekly(body, user);
  }

  /** POST /briefs/weekly/patterns — 4-week trend/anomaly scan. Generate-only, never persisted. */
  @Post("weekly/patterns")
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: "briefs-weekly-patterns", limit: 10, windowMs: 60_000 })
  patterns(
    @Body(weeklyPatternsPipe) body: ContractOutput<typeof weeklyPatternsSchema>,
  ): Promise<WeeklyPatternsAiOutput> {
    return this.briefs.generatePatterns(body);
  }
}
