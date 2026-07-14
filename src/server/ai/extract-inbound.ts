import "server-only";
import { APICallError } from "ai";
import { z } from "zod";
import { INBOUND_INTENTS, type InboundExtractedDTO } from "@/lib/validation/inbound";
import { AppError } from "@/server/http/app-error";
import { aiEnabled } from "./config";
import { generateStructured } from "./provider";

/**
 * Inbound-message extraction (Wave 2.8, legacy `inbound_triage` — Gemini-only). Provider-agnostic
 * via `generateStructured` (same layer as `parse-resume.ts`): the concrete provider is resolved
 * from `AI_MODEL`, so switching vendors is a config change. The raw message + extracted output
 * hold candidate PII — NEVER logged.
 */
const SYSTEM_PROMPT = [
  "You triage inbound messages for a US healthcare staffing recruiter (therapists, NPs, MDs, PAs).",
  "Extract the candidate's details from the message. Use null for anything not stated or unclear;",
  "never invent values. States are 2-letter US codes.",
];

const extractionSchema = z.object({
  name: z.string().nullable().describe("Candidate's full name, if stated or inferable"),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  credential: z
    .string()
    .nullable()
    .describe("Clinical credential, e.g. LCSW, PMHNP, MD, PsyD, LPC, NP"),
  licenseState: z.string().nullable().describe("2-letter US state of licensure, if mentioned"),
  city: z.string().nullable(),
  state: z.string().nullable().describe("2-letter US state where they are located"),
  yearsExp: z.number().int().min(0).max(80).nullable(),
  settingPreference: z
    .string()
    .nullable()
    .describe("Preferred setting: Outpatient, Telehealth, Hybrid, Inpatient, IOP, PHP…"),
  populationPreference: z
    .string()
    .nullable()
    .describe("Preferred population, e.g. Adult, Child/Adolescent"),
  telehealthPreference: z.string().nullable().describe("Telehealth / On-site / Hybrid, if stated"),
  rateExpectation: z.string().nullable().describe('Pay expectation as stated, e.g. "$75/hr+"'),
  availability: z.string().nullable().describe("Start date / availability, as stated"),
  intent: z.enum(INBOUND_INTENTS),
  summary: z.string().describe("One or two sentences summarizing who this is and what they want"),
});

/**
 * Extract structured candidate data from a pasted inbound reply. Gated on `aiEnabled`. Provider
 * errors map to the same `AppError` codes as `parseResume` (FEATURE_DISABLED / RATE_LIMITED /
 * EXTRACTION_FAILED) so the route/UI handle both AI features identically.
 */
export async function extractInbound(
  messageText: string,
  context?: string | null,
): Promise<InboundExtractedDTO> {
  if (!aiEnabled) {
    throw new AppError("FEATURE_DISABLED", "Inbound triage is not configured");
  }
  const prompt = [
    context ? `Context from the recruiter: ${context}` : null,
    "--- MESSAGE ---",
    messageText,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    return await generateStructured({
      schema: extractionSchema,
      system: SYSTEM_PROMPT.join(" "),
      prompt,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        throw new AppError("FEATURE_DISABLED", "Inbound triage is not configured");
      }
      if (err.statusCode === 429) {
        throw new AppError("RATE_LIMITED", "Inbound triage is busy, please retry shortly");
      }
    }
    throw new AppError("EXTRACTION_FAILED", "The message could not be extracted");
  }
}
