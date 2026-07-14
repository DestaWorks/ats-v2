import "server-only";
import { APICallError } from "ai";
import { z } from "zod";
import { ROLE_PRIORITIES } from "@/lib/constants/open-role";
import type { ParsedJdDTO } from "@/lib/validation/open-role";
import { AppError } from "@/server/http/app-error";
import { aiEnabled } from "./config";
import { generateStructured } from "./provider";

/**
 * JD autofill (Wave 3.5, legacy `ats_parse_jd` — Gemini-only). Same provider-agnostic layer as
 * `parse-resume.ts` / `extract-inbound.ts`: `generateStructured` resolves the provider from
 * `AI_MODEL`. Extracts the Open Role fields from a pasted job description.
 */
const SYSTEM_PROMPT =
  "You extract structured job-requisition data for a US healthcare staffing recruiter from a " +
  "pasted job description. Use null for anything not stated; never invent values. State is a " +
  "2-letter US code.";

const jdSchema = z.object({
  title: z.string().nullable(),
  credential: z
    .string()
    .nullable()
    .describe("Clinical credential required, e.g. LCSW, PMHNP, MD, PsyD, LPC, NP"),
  state: z.string().nullable(),
  city: z.string().nullable(),
  setting: z.string().nullable().describe("Outpatient, Telehealth, Hybrid, Inpatient, IOP, PHP…"),
  population: z.string().nullable().describe("e.g. Adult, Child/Adolescent"),
  rate: z.string().nullable().describe('Pay/rate as stated, e.g. "$75-90/hr"'),
  priority: z.enum(ROLE_PRIORITIES).describe("P1 = urgent/critical, P2 = normal, P3 = low urgency"),
  description: z.string().nullable().describe("One or two sentence summary of the role"),
});

/** Extract role fields from a pasted job description. Gated on `aiEnabled`. */
export async function extractJd(text: string): Promise<ParsedJdDTO> {
  if (!aiEnabled) {
    throw new AppError("FEATURE_DISABLED", "JD parsing is not configured");
  }
  try {
    return await generateStructured({
      schema: jdSchema,
      system: SYSTEM_PROMPT,
      prompt: `Extract the role fields from this job description.\n\n--- JOB DESCRIPTION ---\n${text}`,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        throw new AppError("FEATURE_DISABLED", "JD parsing is not configured");
      }
      if (err.statusCode === 429) {
        throw new AppError("RATE_LIMITED", "JD parsing is busy, please retry shortly");
      }
    }
    throw new AppError("EXTRACTION_FAILED", "The job description could not be extracted");
  }
}
