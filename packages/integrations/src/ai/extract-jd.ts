import { z } from "zod";
import { ROLE_PRIORITIES } from "@destaworks/domain/constants/open-role";
import type { ParsedJdDTO } from "@destaworks/contracts/validation/open-role";
import { generateAi } from "./shared";

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
  return generateAi("JD parsing", {
    schema: jdSchema,
    system: SYSTEM_PROMPT,
    prompt: `Extract the role fields from this job description.\n\n--- JOB DESCRIPTION ---\n${text}`,
  });
}
