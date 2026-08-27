import { BRIEF_VOICE_INSTRUCTION } from "@destaworks/domain/constants";
import {
  weeklyPatternsAiSchema,
  type WeeklyPatternsAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { generateAi } from "../shared";

export interface WeeklyPatternsWeek {
  weekStart: string;
  sourced: number;
  outreach: number;
  responses: number;
  promoted: number;
  hires: number;
  topAssociates: { name: string; sourced: number; outreach: number; responses: number }[];
}

export interface WeeklyPatternsContext {
  /** This week first, then the prior 3 weeks — 4 weeks total (legacy's slim payload shape). */
  weeks: WeeklyPatternsWeek[];
}

const SYSTEM_PROMPT = [
  "You are analyzing 4 weeks of recruiting-team data for a US healthcare staffing agency.",
  BRIEF_VOICE_INSTRUCTION,
  "Surface trends, anomalies, and patterns worth flagging — not a restatement of the numbers.",
  "Surface only the 3-5 most actionable patterns.",
].join(" ");

function buildPrompt(ctx: WeeklyPatternsContext): string {
  return ctx.weeks
    .map((w, i) => {
      const label = i === 0 ? "This week" : `${i} week(s) ago`;
      const top = w.topAssociates
        .map(
          (a) =>
            `${a.name} (sourced ${a.sourced}, outreach ${a.outreach}, responses ${a.responses})`,
        )
        .join("; ");
      return [
        `${label} (${w.weekStart}): sourced ${w.sourced}, outreach ${w.outreach}, responses ${w.responses}, promoted ${w.promoted}, hires ${w.hires}.`,
        top ? `Top associates: ${top}` : null,
      ]
        .filter(Boolean)
        .join(" ");
    })
    .join("\n");
}

/** 4-week pattern detection (legacy `weekly_brief_patterns`). Never persisted, generate-only. */
export function generateWeeklyPatterns(
  ctx: WeeklyPatternsContext,
): Promise<WeeklyPatternsAiOutput> {
  return generateAi("Weekly Patterns", {
    schema: weeklyPatternsAiSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(ctx),
    maxOutputTokens: 2048,
  });
}
