/**
 * AI Client Workspace contract (Wave 4.2 flex, legacy `Code.gs:4694-4843` `crm_ai_workspace`,
 * `index.html:7056-7099`). Pure (NO server imports). Legacy's output is flat text, not a
 * multi-field structured object like the Wave 5.1 briefs — the schema reflects that.
 */
import { z } from "zod";

export const AI_WORKSPACE_PRESETS = ["brief", "draft", "next_move", "summary"] as const;
export type AiWorkspacePreset = (typeof AI_WORKSPACE_PRESETS)[number];

export const AI_WORKSPACE_PRESET_LABELS: Record<AiWorkspacePreset, string> = {
  brief: "Client Brief",
  draft: "Draft an Email",
  next_move: "What's the Next Move?",
  summary: "Summarize Relationship",
};

/** Exactly one of `preset`/`customPrompt` — enforced by the `.refine` below. */
export const generateWorkspaceSchema = z
  .object({
    preset: z.enum(AI_WORKSPACE_PRESETS).nullish(),
    customPrompt: z.string().trim().min(1).max(2000).nullish(),
  })
  .strict()
  .refine((v) => Boolean(v.preset) !== Boolean(v.customPrompt), {
    message: "Provide exactly one of preset or customPrompt",
  });
export type GenerateWorkspaceInput = z.infer<typeof generateWorkspaceSchema>;

export interface WorkspaceResultDTO {
  text: string;
}
