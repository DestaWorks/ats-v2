import { BRIEF_VOICE_INSTRUCTION } from "@destaworks/domain/constants";
import {
  weeklyBriefAiSchema,
  type WeeklyBriefAiOutput,
} from "@destaworks/contracts/validation/briefs";
import type { AiCallOptions } from "../deadline";
import { generateAi } from "../shared";

export interface WeeklyBriefAssociateContext {
  name: string;
  sourced: number;
  outreach: number;
  responses: number;
  promoted: number;
  hires: number;
}

export interface WeeklyBriefWeekTotals {
  sourced: number;
  outreach: number;
  responses: number;
  promoted: number;
  hires: number;
}

export interface WeeklyBriefContext {
  weekStart: string;
  weekEnd: string;
  thisWeek: WeeklyBriefWeekTotals;
  lastWeek: WeeklyBriefWeekTotals;
  perAssociate: WeeklyBriefAssociateContext[];
  clientCards: { clientName: string; activityCount: number }[];
  /** Last week's saved highlights/blockers/nextWeekPriorities, if any — the accountability check. */
  lastWeekBrief: { highlights: string; blockers: string; nextWeekPriorities: string } | null;
}

const SYSTEM_PROMPT = [
  "You are drafting this week's Weekly Brief for a US healthcare staffing recruiting team.",
  BRIEF_VOICE_INSTRUCTION,
  "kpiNarrative reads the week-over-week deltas in plain language — not a number dump.",
  "clientCards covers the top clients by activity; perAssociate covers every active recruiter.",
  "lastWeekCheck is populated ONLY if last week's priorities are provided below; otherwise [].",
].join(" ");

function buildPrompt(ctx: WeeklyBriefContext): string {
  const lines: string[] = [`Week: ${ctx.weekStart} to ${ctx.weekEnd}`];
  const fmt = (t: WeeklyBriefWeekTotals) =>
    `sourced ${t.sourced}, outreach ${t.outreach}, responses ${t.responses}, promoted ${t.promoted}, hires ${t.hires}`;
  lines.push(`This week: ${fmt(ctx.thisWeek)}`, `Last week: ${fmt(ctx.lastWeek)}`);
  lines.push(
    "Per-associate this week:",
    ...ctx.perAssociate.map(
      (a) =>
        `- ${a.name}: sourced ${a.sourced}, outreach ${a.outreach}, responses ${a.responses}, promoted ${a.promoted}, hires ${a.hires}`,
    ),
  );
  lines.push(
    "Top clients by activity:",
    ...ctx.clientCards.map((c) => `- ${c.clientName}: ${c.activityCount} touches this week`),
  );
  if (ctx.lastWeekBrief) {
    lines.push(
      "Last week's saved priorities — check this week's data against them:",
      `Highlights: ${ctx.lastWeekBrief.highlights || "none"}`,
      `Blockers: ${ctx.lastWeekBrief.blockers || "none"}`,
      `Next-week priorities set last week: ${ctx.lastWeekBrief.nextWeekPriorities || "none"}`,
    );
  } else {
    lines.push("No brief was saved last week — lastWeekCheck should be [].");
  }
  return lines.join("\n");
}

/** Generate this week's Weekly Brief from live context (legacy `weekly_brief_generate`). */
export function generateWeeklyBrief(
  ctx: WeeklyBriefContext,
  options?: AiCallOptions,
): Promise<WeeklyBriefAiOutput> {
  return generateAi("Weekly Brief", {
    ...options,
    schema: weeklyBriefAiSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(ctx),
    maxOutputTokens: 8192,
  });
}
