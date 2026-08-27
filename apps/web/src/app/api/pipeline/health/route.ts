import type { PipelineHealthDTO } from "@destaworks/contracts/validation/pipeline-health";
import { requireUser } from "@destaworks/auth/guards";
import { apiHandler, json } from "@destaworks/integrations/http/api-handler";
import { checkRateLimit } from "@destaworks/integrations/http/rate-limit";
import { pipelineHealthService } from "@destaworks/application/pipeline-health.service";

/** Response body of `POST /api/pipeline/health`. */
export type PostPipelineHealthResponse = PipelineHealthDTO;

/**
 * POST /api/pipeline/health — AI Pipeline Health strip (Wave 5.5 backlog, legacy
 * `ats_pipeline_health`). Team-wide/unfiltered, no special capability (pipeline is core, open to
 * every operator). Rate-limited (paid LLM call, mirrors `briefs/daily/generate`).
 */
export const POST = apiHandler(async () => {
  const user = await requireUser();
  await checkRateLimit(`pipeline-health:${user.id}`, { limit: 20, windowMs: 60_000 });
  return json<PostPipelineHealthResponse>(await pipelineHealthService.generate());
});
