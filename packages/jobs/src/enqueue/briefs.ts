import type {
  GenerateDailyBriefRequest,
  GenerateWeeklyBriefInput,
} from "@destaworks/contracts/validation/briefs";
import type { EnqueuedJobResponse } from "@destaworks/contracts/validation/jobs";
import {
  dailyBriefSingletonKey,
  generateDailyBriefJob,
  generateWeeklyBriefJob,
  weeklyBriefSingletonKey,
} from "../definitions/briefs";
import { jobQueue } from "../runtime";

/**
 * The one place a brief-generation job is enqueued, shared by the Next.js route and the NestJS
 * controller (Phase 4.3 keeps both stacks serving until the traffic switch).
 *
 * Shared rather than duplicated because the singleton key is the interesting part: two copies of
 * "which key collapses which duplicates" is two chances to get it wrong, and getting it wrong
 * costs a second paid LLM run per click on whichever stack has the stale copy.
 *
 * These import the DEFINITIONS, never the handlers — so enqueuing from a Next.js route does not
 * pull the service graph and Prisma into the route's bundle.
 *
 * This is also where the tenant enters the payload. It comes from `tenantId`, which every caller
 * reads off the context its guard resolved — never off the request body, which the client controls.
 */

export async function enqueueDailyBriefGeneration(
  input: GenerateDailyBriefRequest,
  tenantId: string,
): Promise<EnqueuedJobResponse> {
  const jobId = await jobQueue.enqueue(
    generateDailyBriefJob,
    { ...input, tenantId },
    { singletonKey: dailyBriefSingletonKey(tenantId, input.date) },
  );
  return { jobId, job: generateDailyBriefJob.name };
}

export async function enqueueWeeklyBriefGeneration(
  input: GenerateWeeklyBriefInput,
  tenantId: string,
): Promise<EnqueuedJobResponse> {
  const jobId = await jobQueue.enqueue(
    generateWeeklyBriefJob,
    { ...input, tenantId },
    { singletonKey: weeklyBriefSingletonKey(tenantId, input.weekStart) },
  );
  return { jobId, job: generateWeeklyBriefJob.name };
}
