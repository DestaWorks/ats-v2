/**
 * AI Pipeline Health contract (Wave 5.5 backlog, legacy `ats_pipeline_health` — Drop 53,
 * `legacy/Code.gs:1469-1500`) — isomorphic types + zod shared by the AI module and the
 * `/api/pipeline/health` route/client. Pure (NO server imports).
 */
import { z } from "zod";

export const pipelineHealthAiSchema = z.object({
  diagnostic: z
    .string()
    .describe(
      "One sharp sentence naming specific candidates/urgency — the pipeline's state RIGHT NOW",
    ),
  healthScore: z
    .number()
    .min(0)
    .max(100)
    .describe("0-40 = many overdue/stuck, 40-70 = some action needed, 70-100 = healthy"),
  topAction: z.string().describe("The single most valuable next action, specific not generic"),
});
export type PipelineHealthDTO = z.infer<typeof pipelineHealthAiSchema>;
