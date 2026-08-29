import {
  generateDailyBriefRequestSchema,
  generateWeeklyBriefSchema,
  type GenerateDailyBriefRequest,
  type GenerateWeeklyBriefInput,
} from "@destaworks/contracts/validation/briefs";
import { mondayOf } from "@destaworks/domain/daily";
import type { JobDefinition } from "../queue";

/**
 * The two slowest AI operations in the app, moved off the request path (SAAS-RESTRUCTURE-PLAN
 * Phase 5). The definitions live apart from the handlers because an ENQUEUER needs the definition
 * and nothing else: a route that imports `./handlers/briefs` would drag the whole service graph
 * (and Prisma) into a Next.js route bundle to send one row to a queue.
 *
 * The payload schemas are the SAME schemas the endpoints validate their request bodies against.
 * Reusing them is what keeps the queue from becoming a second, drifting definition of "what a
 * brief generation needs" — and the port revalidates on dequeue, so a payload written by an older
 * deploy is checked against the code that will actually run it.
 */

/**
 * `timeoutMs` sits ABOVE the AI budget (120s) on purpose. The order matters: the AI deadline
 * should fire first so the failure is a clean, attributed `504 … did not finish within` from the
 * generation itself, and the job timeout is the backstop for a handler stuck somewhere the AI
 * deadline does not cover (a slow query, a wedged transaction).
 */
const BRIEF_JOB_TIMEOUT_MS = 180_000;

/**
 * Two attempts, not the usual three. Every attempt is a paid LLM call over a prompt assembled from
 * live data, so a retry is worth having for a blipped provider and not worth having three times —
 * by the third the day's numbers have moved and a human is better off asking again.
 */
const BRIEF_JOB_MAX_ATTEMPTS = 2;

export const generateDailyBriefJob: JobDefinition<GenerateDailyBriefRequest> = {
  name: "briefs.daily.generate",
  schema: generateDailyBriefRequestSchema,
  maxAttempts: BRIEF_JOB_MAX_ATTEMPTS,
  timeoutMs: BRIEF_JOB_TIMEOUT_MS,
};

export const generateWeeklyBriefJob: JobDefinition<GenerateWeeklyBriefInput> = {
  name: "briefs.weekly.generate",
  schema: generateWeeklyBriefSchema,
  maxAttempts: BRIEF_JOB_MAX_ATTEMPTS,
  timeoutMs: BRIEF_JOB_TIMEOUT_MS,
};

/**
 * Singleton keys are keyed on the PERIOD, not on the user.
 *
 * A daily brief is one team-wide document per day: two people (or one person clicking twice)
 * asking for today's brief want the same artefact, and charging for a second identical LLM run
 * would be paying twice for one answer. Keying on the user would collapse only the double-click
 * and miss the far likelier case of two leads opening the page in the same minute.
 *
 * The week key is normalised through `mondayOf` for the same reason the service normalises it:
 * "this week" reaches the server as any day inside it, and three spellings of one week must not
 * become three jobs.
 */
export function dailyBriefSingletonKey(date: string): string {
  return `${generateDailyBriefJob.name}:${date}`;
}

export function weeklyBriefSingletonKey(weekStart: string): string {
  return `${generateWeeklyBriefJob.name}:${mondayOf(weekStart)}`;
}
