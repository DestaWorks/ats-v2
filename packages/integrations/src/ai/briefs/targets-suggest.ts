import { BRIEF_VOICE_INSTRUCTION } from "@destaworks/domain/constants";
import {
  targetsSuggestAiSchema,
  type TargetsSuggestAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { generateAi } from "../shared";

export interface TargetsSuggestContext {
  associateName: string;
  date: string;
  /** Tenure-ramp phase (`lib/daily.ts` `rampFor`) — the floor these targets should build from. */
  ramp: { label: string; sourcing: number; outreach: number };
  /** Last 5 days of self-reported numbers, most recent first — empty if the associate is new. */
  recentDays: { date: string; sourced: number; outreach: number }[];
}

const SYSTEM_PROMPT = [
  "You suggest one recruiter's daily targets for a US healthcare staffing agency.",
  BRIEF_VOICE_INSTRUCTION,
  "Build from the tenure-ramp floor, adjusted up or down based on recent actual performance.",
  "Never suggest below the ramp floor for sourcing/outreach unless recent data shows the associate",
  "is new and still ramping. atsCleanup/inbound/screens default low unless recent data suggests otherwise.",
].join(" ");

function buildPrompt(ctx: TargetsSuggestContext): string {
  const lines = [
    `Associate: ${ctx.associateName}, date: ${ctx.date}`,
    `Tenure-ramp phase: ${ctx.ramp.label} (floor: ${ctx.ramp.sourcing} sourcing, ${ctx.ramp.outreach} outreach)`,
  ];
  if (ctx.recentDays.length > 0) {
    lines.push(
      "Recent days (most recent first):",
      ...ctx.recentDays.map((d) => `- ${d.date}: ${d.sourced} sourced, ${d.outreach} outreach`),
    );
  } else {
    lines.push("No recent history — use the ramp floor as-is.");
  }
  return lines.join("\n");
}

/** Suggest one associate's day targets (legacy `ats_targets_suggest`). */
export function suggestTargets(ctx: TargetsSuggestContext): Promise<TargetsSuggestAiOutput> {
  return generateAi("Target suggestion", {
    schema: targetsSuggestAiSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(ctx),
    maxOutputTokens: 1024,
  });
}
