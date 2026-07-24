/**
 * Briefs contract (Wave 5.1, legacy `daily_brief_*`/`weekly_brief_*`) — isomorphic types + zod
 * shared by the brief routes and the Daily Brief / Weekly Brief clients. Pure (NO server
 * imports). AI generation happens server-side via the provider-agnostic layer (`server/ai`);
 * these schemas are BOTH the AI's structured-output contract (`generateStructured`) and the
 * request/response contract for the generate/save routes — one shape, not two.
 */
import { z } from "zod";
import { DATE_KEY_RE } from "@/lib/daily";

const dateKey = z.string().regex(DATE_KEY_RE, "Expected YYYY-MM-DD");

// --- AI output shapes (also the editable "draft" the client holds between generate → save) ----

export const dailyBriefAiSchema = z.object({
  headline: z.string().describe("One sharp sentence — the single most important thing today"),
  exceptions: z
    .array(z.string())
    .describe("3-5 exception-first callouts: what's off-track and needs attention NOW"),
  yesterdayCheck: z
    .array(z.object({ associate: z.string(), note: z.string() }))
    .describe("Accountability check against yesterday's commitments — empty if none existed"),
  clientCards: z
    .array(z.object({ clientName: z.string(), summary: z.string() }))
    .describe("Top clients by activity, most active first"),
  perAssociate: z
    .array(z.object({ name: z.string(), todos: z.array(z.string()) }))
    .describe("Every active recruiter, with specific (not vague) next actions"),
  teamPulse: z.string().describe("One sentence on overall team health/momentum"),
});
export type DailyBriefAiOutput = z.infer<typeof dailyBriefAiSchema>;

export const weeklyBriefAiSchema = z.object({
  headline: z.string(),
  kpiNarrative: z.string().describe("Plain-language read of the KPI deltas — not a number dump"),
  clientCards: z.array(z.object({ clientName: z.string(), summary: z.string() })),
  perAssociate: z.array(z.object({ name: z.string(), summary: z.string() })),
  lastWeekCheck: z
    .array(z.object({ item: z.string(), status: z.string() }))
    .describe("Accountability against last week's saved priorities — empty if none existed"),
  decisions: z.array(z.string()).describe("Decisions that came out of this week, if any"),
  highlights: z.string(),
  blockers: z.string(),
});
export type WeeklyBriefAiOutput = z.infer<typeof weeklyBriefAiSchema>;

export const weeklyPatternsAiSchema = z.object({
  patterns: z
    .array(z.object({ insight: z.string(), evidence: z.string(), action: z.string() }))
    .describe("3-5 most actionable trends/anomalies across the last 4 weeks"),
});
export type WeeklyPatternsAiOutput = z.infer<typeof weeklyPatternsAiSchema>;

export const targetsSuggestAiSchema = z.object({
  sourcing: z.number().int().min(0).max(999),
  outreach: z.number().int().min(0).max(999),
  atsCleanup: z.number().int().min(0).max(999),
  inbound: z.number().int().min(0).max(999),
  screens: z.number().int().min(0).max(999),
  rationale: z.string().describe("One sentence explaining the suggested numbers"),
});
export type TargetsSuggestAiOutput = z.infer<typeof targetsSuggestAiSchema>;

// --- persisted-row DTOs (what GET/save return — attribution resolved to a name) ---------------

export interface DailyBriefDTO extends DailyBriefAiOutput {
  date: string;
  priorityClientId: string | null;
  shiftA: string | null;
  shiftB: string | null;
  watchItems: string | null;
  savedByName: string | null;
  savedAt: string | null; // ISO
}

export interface WeeklyBriefDTO extends WeeklyBriefAiOutput {
  weekStart: string;
  savedByName: string | null;
  savedAt: string | null; // ISO
}

// --- request schemas ----------------------------------------------------------------------

/** `POST /api/briefs/daily/generate` — assembles live context + calls the AI, returns a draft. */
/** NOT `.strict()` — the request body also carries `manualInputsSchema`'s fields (route parses
 *  both against the same JSON body); unknown keys are stripped here, not rejected. */
export const generateDailyBriefSchema = z.object({ date: dateKey, tz: z.coerce.number().int() });
export type GenerateDailyBriefInput = z.infer<typeof generateDailyBriefSchema>;

/** `POST /api/briefs/daily/save` — persist the (possibly edited) draft + manual inputs. */
export const saveDailyBriefSchema = dailyBriefAiSchema
  .extend({
    date: dateKey,
    priorityClientId: z.string().min(1).nullish(),
    shiftA: z.string().trim().max(2000).nullish(),
    shiftB: z.string().trim().max(2000).nullish(),
    watchItems: z.string().trim().max(2000).nullish(),
  })
  .strict();
export type SaveDailyBriefInput = z.infer<typeof saveDailyBriefSchema>;

/** `POST /api/briefs/weekly/generate`. */
export const generateWeeklyBriefSchema = z
  .object({ weekStart: dateKey, tz: z.coerce.number().int() })
  .strict();
export type GenerateWeeklyBriefInput = z.infer<typeof generateWeeklyBriefSchema>;

/** `POST /api/briefs/weekly/save`. */
export const saveWeeklyBriefSchema = weeklyBriefAiSchema.extend({ weekStart: dateKey }).strict();
export type SaveWeeklyBriefInput = z.infer<typeof saveWeeklyBriefSchema>;

/** `POST /api/briefs/weekly/patterns` — generate-only, never persisted (legacy parity). */
export const weeklyPatternsSchema = z
  .object({ weekStart: dateKey, tz: z.coerce.number().int() })
  .strict();
export type WeeklyPatternsInput = z.infer<typeof weeklyPatternsSchema>;

/** `POST /api/targets/suggest` — feeds the existing 3.1 manager target-setting modal. */
export const suggestTargetsSchema = z.object({ userId: z.string().min(1), date: dateKey }).strict();
export type SuggestTargetsInput = z.infer<typeof suggestTargetsSchema>;
