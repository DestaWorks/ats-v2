import "server-only";
import { BRIEF_VOICE_INSTRUCTION } from "@destaworks/domain/constants";
import {
  dailyBriefAiSchema,
  type DailyBriefAiOutput,
} from "@destaworks/contracts/validation/briefs";
import { generateAi } from "../shared";

/** One associate's rollup for the day — sourced/outreach live counts + workload + risk. */
export interface DailyBriefAssociateContext {
  name: string;
  sourced: number;
  outreach: number;
  assignedCandidates: number;
  stuckCount: number;
}

export interface DailyBriefClientContext {
  clientName: string;
  activityCount: number;
}

export interface DailyBriefContext {
  date: string;
  perAssociate: DailyBriefAssociateContext[];
  clientCards: DailyBriefClientContext[];
  alerts: {
    stuckSourced: string[]; // candidate names, sourced but no outreach in threshold window
    stuckOutreach: string[]; // candidate names, outreach sent but stuck in stage
  };
  openRoles: { p1: number; p2: number; p3: number; top: string[] };
  manualInputs: {
    priorityClientName: string | null;
    shiftA: string | null;
    shiftB: string | null;
    watchItems: string | null;
  };
  /** Yesterday's STRUCTURED brief, if saved — not a lossy plain-text round-trip like legacy. */
  yesterday: { exceptions: string[]; perAssociate: { name: string; todos: string[] }[] } | null;
}

const SYSTEM_PROMPT = [
  "You are drafting today's Daily Brief for a US healthcare staffing recruiting team.",
  BRIEF_VOICE_INSTRUCTION,
  "Rules: exceptions are capped at 3-5 and come FIRST — what's off-track, named specifically.",
  "yesterdayCheck is populated ONLY if yesterday's data is provided below; otherwise return [].",
  "clientCards covers the top clients by activity. perAssociate covers EVERY active recruiter",
  "with specific, actionable todos — never vague filler like 'keep going' or 'stay focused'.",
].join(" ");

function buildPrompt(ctx: DailyBriefContext): string {
  const lines: string[] = [`Date: ${ctx.date}`];
  lines.push(
    "Per-associate today:",
    ...ctx.perAssociate.map(
      (a) =>
        `- ${a.name}: sourced ${a.sourced}, outreach ${a.outreach}, ${a.assignedCandidates} assigned candidates, ${a.stuckCount} stuck`,
    ),
  );
  lines.push(
    "Top clients by activity:",
    ...ctx.clientCards.map((c) => `- ${c.clientName}: ${c.activityCount} touches today`),
  );
  if (ctx.alerts.stuckSourced.length > 0) {
    lines.push(`Sourced with no outreach yet: ${ctx.alerts.stuckSourced.join(", ")}`);
  }
  if (ctx.alerts.stuckOutreach.length > 0) {
    lines.push(`Stuck in stage after outreach: ${ctx.alerts.stuckOutreach.join(", ")}`);
  }
  lines.push(`Open roles: ${ctx.openRoles.p1} P1, ${ctx.openRoles.p2} P2, ${ctx.openRoles.p3} P3.`);
  if (ctx.openRoles.top.length > 0) lines.push(`Top open roles: ${ctx.openRoles.top.join(", ")}`);
  const manual = ctx.manualInputs;
  if (manual.priorityClientName)
    lines.push(`Priority client (manager-set): ${manual.priorityClientName}`);
  if (manual.shiftA) lines.push(`Shift A note: ${manual.shiftA}`);
  if (manual.shiftB) lines.push(`Shift B note: ${manual.shiftB}`);
  if (manual.watchItems) lines.push(`Watch items: ${manual.watchItems}`);
  if (ctx.yesterday) {
    lines.push(
      "Yesterday's brief — check today's data against these commitments:",
      `Exceptions: ${ctx.yesterday.exceptions.join("; ") || "none"}`,
      ...ctx.yesterday.perAssociate.map((a) => `- ${a.name} was asked to: ${a.todos.join("; ")}`),
    );
  } else {
    lines.push("No brief was saved yesterday — yesterdayCheck should be [].");
  }
  return lines.join("\n");
}

/** Generate today's Daily Brief from live context (legacy `daily_brief_generate`). */
export function generateDailyBrief(ctx: DailyBriefContext): Promise<DailyBriefAiOutput> {
  return generateAi("Daily Brief", {
    schema: dailyBriefAiSchema,
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(ctx),
    maxOutputTokens: 4096,
  });
}
