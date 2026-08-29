import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  addFeedbackSchema,
  journalEntrySchema,
  journalGoalSchema,
  recapQuerySchema,
  RECAP_MAX_LOOKBACK_DAYS,
  saveActualsSchema,
  setTargetSchema,
  submitLogSchema,
  teamBreakdownQuerySchema,
  toggleGoalSchema,
  type AcknowledgedDTO,
  type CreatedJournalEntryDTO,
  type CreatedJournalGoalDTO,
  type DailyLogViewDTO,
  type DailyOverviewDTO,
  type RecapDTO,
  type SubmittedLogDTO,
  type TeamBreakdownDTO,
} from "@destaworks/contracts/validation/daily";
import { MS_PER_DAY, systemClock, type Clock } from "@destaworks/domain/clock";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import { resolveViewerTz, viewerDay } from "../../common/viewer-time";
import type { ServiceOf } from "../service-token";
import { DAILY_SERVICE } from "./daily.tokens";

const submitLogPipe = new ZodValidationPipe(submitLogSchema);
const saveActualsPipe = new ZodValidationPipe(saveActualsSchema);
const setTargetPipe = new ZodValidationPipe(setTargetSchema);
const addFeedbackPipe = new ZodValidationPipe(addFeedbackSchema);
const journalEntryPipe = new ZodValidationPipe(journalEntrySchema);
const journalGoalPipe = new ZodValidationPipe(journalGoalSchema);
const toggleGoalPipe = new ZodValidationPipe(toggleGoalSchema);
const teamBreakdownPipe = new ZodValidationPipe(teamBreakdownQuerySchema);
const recapQueryPipe = new ZodValidationPipe(recapQuerySchema);

/** The write that only reports its own success. One object, not eight `{ ok: true }` literals. */
const ACKNOWLEDGED: AcknowledgedDTO = { ok: true };

/**
 * Clamp `since` to the recap window. A stale `localStorage` timestamp must not turn a page load
 * into a scan of the whole history, so a request reaching further back is pulled forward to the
 * floor rather than refused — the client is not at fault for having been closed a long time.
 *
 * Takes the `Clock` rather than calling `Date.now()`, so the floor is a value a test can pin.
 */
function clampRecapSince(since: Date, clock: Clock = systemClock): Date {
  const floor = clock.now().getTime() - RECAP_MAX_LOOKBACK_DAYS * MS_PER_DAY;
  return since.getTime() < floor ? new Date(floor) : since;
}

/**
 * The daily loop for the SIGNED-IN user: the Daily Log composite, the Overview strip, the
 * End-of-Shift confirmation, the journal, and the two leadership writes (targets, feedback).
 *
 * Authentication only — `SessionAuthGuard`, no capability. Three of these endpoints ARE
 * leadership-only, and the check for all three lives in `dailyService` (`SET_TARGETS_CAP`), where
 * it already guards the same operations called from anywhere else. Re-declaring it here would put
 * the authorization rule in two places and let them disagree; the controller stays transport.
 *
 * "Today" comes from the VIEWER's timezone — `?tz=` when the client sends it, the `app-tz` cookie
 * otherwise. See `common/viewer-time`.
 */
@Controller("daily")
@UseGuards(SessionAuthGuard)
export class DailyController {
  constructor(@Inject(DAILY_SERVICE) private readonly daily: ServiceOf<typeof DAILY_SERVICE>) {}

  /** GET /daily/log?date&tz — the Daily Log page composite for the session user. */
  @Get("log")
  async log(
    @Query("date") date: string | undefined,
    @Query("tz") tz: string | undefined,
    @CurrentUser() user: AuthContext,
  ): Promise<DailyLogViewDTO> {
    const offset = await resolveViewerTz(tz);
    return this.daily.logView(user, viewerDay(date, offset), offset);
  }

  /**
   * POST /daily/log — submit the day's self-report. ONE per user/day (409 on resubmit); the
   * server snapshots the auto-capture counts at submit time. 201: it creates the day's log.
   */
  @Post("log")
  async submitLog(
    @Body(submitLogPipe) body: ContractOutput<typeof submitLogSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<SubmittedLogDTO> {
    return { log: await this.daily.submitLog(body, user) };
  }

  /** GET /daily/overview?date&tz — the Overview strip composite for the session user. */
  @Get("overview")
  async overview(
    @Query("date") date: string | undefined,
    @Query("tz") tz: string | undefined,
    @CurrentUser() user: AuthContext,
  ): Promise<DailyOverviewDTO> {
    const offset = await resolveViewerTz(tz);
    return this.daily.overview(user, viewerDay(date, offset), offset);
  }

  /** POST /daily/actuals — End of Shift: the session user confirms the day's numbers. */
  @Post("actuals")
  @HttpCode(HttpStatus.OK)
  async actuals(
    @Body(saveActualsPipe) body: ContractOutput<typeof saveActualsSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<AcknowledgedDTO> {
    await this.daily.saveActuals(body, user);
    return ACKNOWLEDGED;
  }

  /** POST /daily/targets — set/replace one associate's targets for a day. Leadership only. */
  @Post("targets")
  @HttpCode(HttpStatus.OK)
  async setTarget(
    @Body(setTargetPipe) body: ContractOutput<typeof setTargetSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<AcknowledgedDTO> {
    await this.daily.setTarget(body, user);
    return ACKNOWLEDGED;
  }

  /** POST /daily/manager-feedback — post a feedback note to an associate. Leadership only. */
  @Post("manager-feedback")
  @HttpCode(HttpStatus.OK)
  async managerFeedback(
    @Body(addFeedbackPipe) body: ContractOutput<typeof addFeedbackSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<AcknowledgedDTO> {
    await this.daily.addFeedback(body, user);
    return ACKNOWLEDGED;
  }

  /**
   * GET /daily/recap?since=<ISO> — the "Since you closed" buckets, computed from DOMAIN tables
   * rather than the audit log, so it needs no extra capability.
   */
  @Get("recap")
  recap(@Query(recapQueryPipe) query: ContractOutput<typeof recapQuerySchema>): Promise<RecapDTO> {
    return this.daily.recap(clampRecapSince(query.since));
  }

  /** GET /daily/team-breakdown?weekStart — per-associate weekly rollup. Leadership only. */
  @Get("team-breakdown")
  teamBreakdown(
    @Query(teamBreakdownPipe) query: ContractOutput<typeof teamBreakdownQuerySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<TeamBreakdownDTO> {
    return this.daily.teamBreakdown(query.weekStart, user);
  }

  /** POST /daily/journal/entries — add a journal note for the session user. */
  @Post("journal/entries")
  async addEntry(
    @Body(journalEntryPipe) body: ContractOutput<typeof journalEntrySchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<CreatedJournalEntryDTO> {
    return { entry: await this.daily.addEntry(body.date, body.text, user) };
  }

  /** POST /daily/journal/goals — add a weekly goal (`weekStart` normalizes to its Monday). */
  @Post("journal/goals")
  async addGoal(
    @Body(journalGoalPipe) body: ContractOutput<typeof journalGoalSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<CreatedJournalGoalDTO> {
    return { goal: await this.daily.addGoal(body.weekStart, body.text, user) };
  }

  /**
   * PATCH /daily/journal/goals/:id — toggle done/undone. A real update scoped to the owner, so
   * someone else's goal is a 404 rather than a silent no-op.
   */
  @Patch("journal/goals/:id")
  async toggleGoal(
    @Param("id") id: string,
    @Body(toggleGoalPipe) body: ContractOutput<typeof toggleGoalSchema>,
    @CurrentUser() user: AuthContext,
  ): Promise<AcknowledgedDTO> {
    await this.daily.setGoalDone(id, body.done, user);
    return ACKNOWLEDGED;
  }
}
