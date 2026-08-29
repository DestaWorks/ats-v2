import { briefService } from "@destaworks/application/brief.service";
import type {
  GenerateDailyBriefJobPayload,
  GenerateWeeklyBriefJobPayload,
} from "@destaworks/contracts/validation/briefs";
import { systemContextFor } from "@destaworks/domain/system-context";
import type { JobHandler } from "../queue";
import { generateDailyBriefJob, generateWeeklyBriefJob } from "../definitions/briefs";

/**
 * Handlers for the two brief-generation jobs.
 *
 * Each is a THIN adapter: unpack the payload, hand it to the service method that already does the
 * work, and pass the job's `signal` down so a job the worker gives up on also cancels the provider
 * call it is blocked on. Generation logic stays in `@destaworks/application` — a handler that
 * re-assembled the context would be a second implementation of the brief, drifting from the one
 * the (still-served) request path uses.
 *
 * The scope is rebuilt from the payload's tenant with `systemContextFor`, which carries the least
 * privileged role. That is safe HERE because a brief's content does not depend on who asked for
 * it: `viewReports` gates the whole document at the endpoint, and nothing inside it is gated
 * further — the context assembled below is counts, client names, associate names and lead names,
 * with no credential or licence field anywhere. A brief that ever gained a capability-gated field
 * would have to carry the requester's role instead.
 *
 * Handlers live apart from the definitions because they pull the whole service graph in with them;
 * an enqueuer imports `../definitions/briefs` and nothing here.
 */

export const generateDailyBriefHandler: JobHandler<GenerateDailyBriefJobPayload> = async (ctx) => {
  const { payload } = ctx;
  await briefService.generateDailyDraft(
    { date: payload.date, tz: payload.tz },
    {
      priorityClientId: payload.priorityClientId ?? null,
      shiftA: payload.shiftA ?? null,
      shiftB: payload.shiftB ?? null,
      watchItems: payload.watchItems ?? null,
    },
    systemContextFor(payload.tenantId),
    { signal: ctx.signal },
  );
};

export const generateWeeklyBriefHandler: JobHandler<GenerateWeeklyBriefJobPayload> = async (
  ctx,
) => {
  const { tenantId, ...input } = ctx.payload;
  await briefService.generateWeeklyDraft(input, systemContextFor(tenantId), {
    signal: ctx.signal,
  });
};

/**
 * The brief jobs a worker should register, keyed by the definition's queue name. Exported as data
 * so a worker composes its registry from these maps instead of listing every handler by hand and
 * silently missing one when a new job lands.
 */
export const briefJobHandlers = {
  [generateDailyBriefJob.name]: generateDailyBriefHandler,
  [generateWeeklyBriefJob.name]: generateWeeklyBriefHandler,
} as const;
