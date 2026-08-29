import { AppError } from "@destaworks/integrations/http/app-error";
import type {
  GenerateDailyBriefRequest,
  GenerateWeeklyBriefInput,
} from "@destaworks/contracts/validation/briefs";
import type { EnqueuedJobResponse } from "@destaworks/contracts/validation/jobs";

/**
 * The seam through which a request hands brief generation to the job runner — the same shape as
 * `migration-commit.port.ts`, and for the same reason.
 *
 * It is declared here rather than imported from `@destaworks/jobs` so that `apps/web` never needs
 * an edge to that package. The alternative was tried and rejected: with `web -> jobs` permitted,
 * nothing stops a later route importing the pg-boss driver and pulling a Postgres client into a
 * browser-adjacent bundle. A port cannot be misused that way, and it costs one indirection.
 *
 * Both stacks resolve the same registered implementation, so the singleton key that stops a second
 * paid LLM run is defined once, in the job package, where the definitions already live.
 */
export interface BriefGenerationEnqueuer {
  daily(input: GenerateDailyBriefRequest): Promise<EnqueuedJobResponse>;
  weekly(input: GenerateWeeklyBriefInput): Promise<EnqueuedJobResponse>;
}

let enqueuer: BriefGenerationEnqueuer | null = null;

/** Called by the composition root that owns a `JobQueue` (see `@destaworks/jobs`). */
export function registerBriefGenerationEnqueuer(next: BriefGenerationEnqueuer): void {
  enqueuer = next;
}

/** Test-only reset, so one suite's registration cannot leak into the next. */
export function clearBriefGenerationEnqueuer(): void {
  enqueuer = null;
}

export function requireBriefGenerationEnqueuer(): BriefGenerationEnqueuer {
  if (!enqueuer) {
    throw new AppError(
      "INTERNAL",
      "Brief generation is not available. Try again shortly or contact support.",
    );
  }
  return enqueuer;
}
