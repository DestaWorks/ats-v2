import {
  ACTIVE_STATUS_CODES,
  statusLabel,
  type CandidateStatus,
} from "@destaworks/domain/constants";
import type { PipelineHealthDTO } from "@destaworks/contracts/validation/pipeline-health";
import type { TenantContext } from "@destaworks/domain/tenant";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { generatePipelineHealth } from "@destaworks/integrations/ai/pipeline-health/pipeline-health";

const MS_PER_DAY = 86_400_000;
const TOP_OVERDUE_LIMIT = 5;

/**
 * How long a generated strip stands before it is regenerated.
 *
 * The strip summarises team-wide counts that move over hours, and every regeneration is a billed
 * model call on the busiest screen in the app. The number to tune is therefore not how fresh it
 * looks but how often reopening the page pays for a new one: long enough that ordinary navigation
 * is free, short enough that a recruiter working a backlog sees it move.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * One entry per workspace — the counts are tenant-scoped, so the cache must be too. The tenant id
 * is the WHOLE key: two workspaces can never read each other's strip through it.
 */
const cached = new Map<string, { value: PipelineHealthDTO; expiresAt: number }>();

/**
 * Entries are only replaced when their own tenant asks again, so a workspace nobody visits keeps
 * its row for the life of the process. Harmless at two tenants and a slow leak at a thousand, so
 * the map is swept past a cap rather than left to grow — the same shape `rate-limit.ts` uses, for
 * the same reason. The sweep runs only past the cap, so the normal path stays O(1).
 */
const MAX_TRACKED_TENANTS = 1000;

function sweepExpired(now: number): void {
  for (const [tenantId, entry] of cached) {
    if (entry.expiresAt <= now) cached.delete(tenantId);
  }
}

/**
 * Generations currently running, by tenant.
 *
 * A cache alone still stampedes: several people opening the pipeline in the same moment each miss
 * an empty cache and start their own model call for identical data. They now await the first one.
 * This matters more than the cache — the cache saves repeat views, this saves concurrent ones,
 * and concurrent is when it hurts.
 */
const inFlight = new Map<string, Promise<PipelineHealthDTO>>();

/**
 * AI Pipeline Health strip (Wave 5.5 backlog, legacy `ats_pipeline_health` — Drop 53). Team-wide,
 * unfiltered — same shared counts `candidateService.listBoard`'s `meta` already computes, plus a
 * small "who's most overdue" context list the AI needs to be specific rather than generic.
 */
export const pipelineHealthService = {
  /**
   * `force` comes from the strip's Refresh button. Every other path — mounting the page, navigating
   * back to it — reads the cache, because that is what was costing a model call per view.
   */
  async generate(
    ctx: TenantContext,
    opts: { readonly force?: boolean } = {},
  ): Promise<PipelineHealthDTO> {
    const hit = cached.get(ctx.tenantId);
    if (!opts.force && hit && hit.expiresAt > Date.now()) return hit.value;

    const running = inFlight.get(ctx.tenantId);
    if (running) return running;

    const generation = runGeneration(ctx);
    inFlight.set(ctx.tenantId, generation);
    try {
      const value = await generation;
      const now = Date.now();
      cached.set(ctx.tenantId, { value, expiresAt: now + CACHE_TTL_MS });
      if (cached.size > MAX_TRACKED_TENANTS) sweepExpired(now);
      return value;
    } finally {
      // Cleared whether it resolved or threw, so one failure cannot wedge the workspace on a
      // rejected promise that every later caller would await.
      inFlight.delete(ctx.tenantId);
    }
  },
};

/** The uncached work: the reads the strip needs, then one model call. */
async function runGeneration(ctx: TenantContext): Promise<PipelineHealthDTO> {
  const now = new Date();
  // `findById` doesn't gate the others — none depends on another's result — so they fire in one
  // round trip rather than a waterfall.
  const [totalActive, overdueCount, stuckCount, overdueRows, clientNames] = await Promise.all([
    candidateRepository.count(ctx, { statuses: [...ACTIVE_STATUS_CODES] }),
    candidateRepository.count(ctx, { overdue: true }),
    candidateRepository.count(ctx, { stuck: true }),
    candidateRepository.topOverdue(ctx, TOP_OVERDUE_LIMIT, now),
    clientRepository.nameMap(ctx),
  ]);

  const topOverdue = overdueRows.map((row) => ({
    name: row.name,
    clientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
    stage: statusLabel(row.status as CandidateStatus),
    daysInStage: Math.floor((now.getTime() - row.stageEnteredAt.getTime()) / MS_PER_DAY),
  }));

  return generatePipelineHealth(
    { totalActive, overdueCount, stuckCount, topOverdue },
    { tenantId: ctx.tenantId },
  );
}

/**
 * Drop all cached strips. For tests, which share one module instance across cases — without it a
 * strip generated by one test would be served to the next, and the cache would look like a bug in
 * whatever ran second.
 */
export function __resetPipelineHealthCache(): void {
  cached.clear();
  inFlight.clear();
}
