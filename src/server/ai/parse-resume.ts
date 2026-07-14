import "server-only";
import { APICallError } from "ai";
import type { ZodType } from "zod";
import type { ResumeVariant } from "@/lib/constants/documents";
import { resumeSchemaFor, type ParseResumeInput, type ResumeData } from "@/lib/validation/resume";
import { AppError } from "@/server/http/app-error";
import { aiEnabled } from "./config";
import { generateStructured } from "./provider";

/**
 * Structured extraction of a résumé (Wave 1.2, Module 8). Replaces the legacy Gemini
 * `handleExtractResume_` — ports the per-variant prompt INTENT (`ROLE_PROMPTS_`), the schema
 * fields (`ROLE_SCHEMAS_`), the "never invent → ''/[]" contract, and the `verificationLine =
 * SOURCES-to-check` rule. The LLM call is **provider-agnostic** (`generateStructured` over the
 * Vercel AI SDK) — Claude / OpenAI / Gemini are selected by the `AI_MODEL` config string, and the
 * zod schema validates the shape before anything is returned.
 *
 * SECURITY (PII/PHI): résumé text and the extracted structured output hold the most sensitive
 * fields in the system (licenseNumber, NPI, DEA, full contact + employment history). This module
 * NEVER logs the text, the structured output, or the raw model request/response body.
 */

/** ~60k-char cap on the résumé text sent to the model (mirrors the legacy limit). */
const MAX_RESUME_CHARS = 60000;

/**
 * Common parser instruction, ported in INTENT from `ROLE_PROMPTS_()`. Structured outputs enforce
 * the JSON shape, so the legacy "return ONLY valid JSON / no markdown fences" plumbing is dropped.
 */
const COMMON_PROMPT = [
  "You are a résumé parser for DestaHealth, a US mental-health recruiting agency.",
  "Extract data from the supplied résumé into the required structured fields.",
  "Rules:",
  '(1) Never invent information. If a field is missing, use an empty string "" or an empty array [].',
  "(2) Match employer names, dates, numbers, and credentials EXACTLY as written.",
  '(3) For "snapshot", you may synthesize a 3–4 sentence sales-grade paragraph, but only restate what is actually in the résumé — do not invent achievements. Quantify where the candidate quantified.',
  "(4) For experience bullets, you may tighten phrasing but never add achievements that are not in the résumé. Lead with verbs. Keep numbers from the résumé.",
  '(5) For "verificationLine", list the SOURCES the recruiter should check — state boards (BHEC for TX behavioral, DORA for CO, TMB for TX medical, DOH for FL, etc.), NPPES for NPI, ABPN for board certification, references, and identity. Use real state-board names where possible. NEVER write "verified by Desta Health" or claim any verification work has been done — only list what should be checked.',
].join(" ");

/** Per-variant guidance, ported from `ROLE_PROMPTS_()`. */
const SYSTEM_PROMPTS: Record<ResumeVariant, string> = {
  clinical: [
    COMMON_PROMPT,
    "ROLE: Clinical (Therapist / Counselor / Psychologist — non-prescribing).",
    "Focus on caseload size, modalities (CBT, EMDR, DBT, etc.), populations served, session completion rates, and supervision provided.",
    "Licensure: state licenses (LPC, LCSW, LMFT, LMHC, PsyD, PhD, etc.).",
    "Do NOT extract DEA, hospital affiliations, or board certifications — those belong to Prescribers.",
  ].join(" "),
  prescriber: [
    COMMON_PROMPT,
    "ROLE: Prescriber (MD, DO, PMHNP-BC, APRN, PA-C).",
    "Focus on panel size, medication management, measurement-based care, supervision of mid-levels, and controlled-substance compliance.",
    "Extract: state licensure, board certifications (ABPN, etc.), DEA registrations per state, NPI, hospital affiliations, and publications.",
    'For a context line, use language like "Panel of X adults", not "caseload".',
  ].join(" "),
  operations: [
    COMMON_PROMPT,
    "ROLE: Operations (admin, billing, intake, scheduling — non-clinical).",
    "No licensure. Focus on US payer-side systems (Athenahealth, Availity, Waystar, etc.), coverage hours, English proficiency, and throughput metrics.",
    'For a context line, use language like "Supports an X-provider group", not "panel" or "caseload".',
    "Do NOT extract licenses, NPI, DEA, or hospital affiliations. For US-bound Ethiopia hires, capture coverage hours that show the EAT/ET overlap clearly.",
  ].join(" "),
};

/**
 * Extract a résumé with the configured LLM provider. Gated on `aiEnabled` (the provider's key
 * being present). Returns the zod-validated structured data for the variant, or throws a typed
 * `AppError`. The zod schema is enforced by `generateObject`, so an invalid/absent object
 * surfaces as EXTRACTION_FAILED — no manual JSON parsing.
 */
export async function parseResume(input: ParseResumeInput): Promise<ResumeData> {
  if (!aiEnabled) {
    throw new AppError("FEATURE_DISABLED", "Résumé extraction is not configured");
  }

  // resumeSchemaFor returns a union of the 3 variant schemas; the result is a ResumeData member.
  const schema = resumeSchemaFor(input.variant) as unknown as ZodType<ResumeData>;
  const system = SYSTEM_PROMPTS[input.variant];
  const text = input.text.slice(0, MAX_RESUME_CHARS);

  try {
    return await generateStructured({
      schema,
      system,
      prompt: `Extract the résumé below into the required structured fields.\n\nRÉSUMÉ:\n${text}`,
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Map provider errors → AppError by HTTP status. Never include the raw model message (may echo PII).
    if (APICallError.isInstance(err)) {
      if (err.statusCode === 401 || err.statusCode === 403) {
        throw new AppError("FEATURE_DISABLED", "Résumé extraction is not configured");
      }
      if (err.statusCode === 429) {
        throw new AppError("RATE_LIMITED", "Résumé extraction is busy, please retry shortly");
      }
    }
    throw new AppError("EXTRACTION_FAILED", "The résumé could not be extracted");
  }
}
