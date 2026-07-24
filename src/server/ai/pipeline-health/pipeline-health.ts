import "server-only";
import { pipelineHealthAiSchema, type PipelineHealthDTO } from "@/lib/validation/pipeline-health";
import { generateAi } from "../shared";

/** One overdue candidate for the AI's attention — the longest-in-stage first. */
export interface PipelineHealthOverdueCandidate {
  name: string;
  clientName: string | null;
  stage: string;
  daysInStage: number;
}

export interface PipelineHealthContext {
  totalActive: number;
  overdueCount: number;
  stuckCount: number;
  topOverdue: PipelineHealthOverdueCandidate[];
}

const SYSTEM_PROMPT = [
  "You are a diagnostic assistant for a healthcare staffing recruiting pipeline.",
  "Rules: the diagnostic is ONE sharp sentence naming specific candidates/urgency when relevant —",
  "never generic filler. healthScore follows the rubric: 0-40 = many overdue/stuck, 40-70 = some",
  "action needed, 70-100 = healthy. topAction is the single most valuable next step, specific not",
  "generic (name a candidate or client when one stands out).",
].join(" ");

function buildPrompt(ctx: PipelineHealthContext): string {
  const lines: string[] = [
    `Active candidates: ${ctx.totalActive}.`,
    `Overdue (past stage SLA): ${ctx.overdueCount}. Stuck (>threshold days in stage): ${ctx.stuckCount}.`,
  ];
  if (ctx.topOverdue.length > 0) {
    lines.push(
      "Longest-overdue candidates:",
      ...ctx.topOverdue.map(
        (c) =>
          `- ${c.name} (${c.clientName ?? "no client"}, ${c.stage}, ${c.daysInStage} days in stage)`,
      ),
    );
  } else {
    lines.push("No overdue candidates right now.");
  }
  return lines.join("\n");
}

/** Generate a one-shot pipeline health read (legacy `ats_pipeline_health`). */
export function generatePipelineHealth(ctx: PipelineHealthContext): Promise<PipelineHealthDTO> {
  return generateAi("Pipeline Health", {
    schema: pipelineHealthAiSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(ctx),
    maxOutputTokens: 512,
  });
}
