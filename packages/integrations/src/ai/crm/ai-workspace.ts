import { z } from "zod";
import type { AiWorkspacePreset } from "@destaworks/contracts/validation/crm-ai-workspace";
import { generateAi } from "../shared";

/**
 * AI Client Workspace (Wave 4.2 flex, legacy `crm_ai_workspace`, `Code.gs:4694-4843`) — a
 * per-client AI briefing/drafting surface. Legacy called raw Gemini REST directly (the same
 * anti-pattern Wave 5.1 fixed for Daily/Weekly Brief); this goes through the same
 * provider-agnostic `generateAi()` wrapper. Output is flat text (legacy's own shape — no need
 * for the richer multi-field brief schema).
 *
 * Reads whatever CRM activity exists (notes/tasks/meetings/deals) — works with zero Gmail data
 * today and gets richer automatically once Gmail sync lands (a new activity source flowing into
 * the same `recentActivity` lines), no rework needed here.
 */

export interface WorkspaceContext {
  clientName: string;
  priority: string | null;
  cadence: string | null;
  /** Recent activity, newest first, already formatted as short lines — capped by the caller. */
  recentActivity: string[];
}

const workspaceSchema = z.object({ text: z.string() });

const SYSTEM_PROMPT =
  "You are a CRM assistant for a US healthcare staffing recruiting agency, helping an account " +
  "manager work a client relationship. Be specific and reference the actual activity given — " +
  "never invent facts, meetings, or commitments that aren't in the context. If the context is " +
  "thin, say so plainly rather than padding with generic advice.";

const PRESET_PROMPTS: Record<AiWorkspacePreset, string> = {
  brief:
    "Write a short client brief: current relationship status, what's working, what's at risk, " +
    "and the single most important thing to do next.",
  draft:
    "Draft a short, professional check-in email to this client, grounded in the recent " +
    "activity below. Keep it warm but concrete — reference something real, not filler.",
  next_move:
    "Recommend the ONE next action to take with this client and why, based on the activity " +
    "below (or the lack of it).",
  summary: "Summarize the relationship with this client in 2-3 sentences.",
};

function buildContext(ctx: WorkspaceContext): string {
  const lines = [
    `Client: ${ctx.clientName}`,
    ctx.priority ? `Priority: ${ctx.priority}` : null,
    ctx.cadence ? `Cadence: ${ctx.cadence}` : null,
    "",
    "Recent activity (newest first):",
    ...(ctx.recentActivity.length > 0
      ? ctx.recentActivity
      : ["(No activity logged for this client yet.)"]),
  ];
  return lines.filter((l) => l !== null).join("\n");
}

/** Generate text for a fixed preset or a custom free-text prompt (exactly one, validated by the caller). */
export function generateWorkspaceText(
  ctx: WorkspaceContext,
  input: { preset?: AiWorkspacePreset | null; customPrompt?: string | null },
): Promise<{ text: string }> {
  const task = input.preset ? PRESET_PROMPTS[input.preset] : (input.customPrompt as string);
  const prompt = `${buildContext(ctx)}\n\n---\n\nTASK: ${task}`;
  return generateAi("AI Client Workspace", {
    schema: workspaceSchema,
    system: SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 2048,
  });
}
