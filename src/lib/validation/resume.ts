/**
 * Résumé extraction contract (Wave 1.2) — the shared interface between the Claude extraction
 * (`server/ai/parse-resume`), the API routes, and the client review form. Isomorphic (zod, no
 * server imports). Ported from the legacy Gemini `ROLE_SCHEMAS_` (Code.gs ~3125–3260).
 *
 * Convention (from the design): missing values are `""` / `[]`, NOT `.optional()` — the model is
 * told never to invent, and the render layouts + structured-output schema stay simple. These plain
 * string/array shapes are all valid for Claude structured outputs (no minLength/format/recursion).
 */
import { z } from "zod";
import { RESUME_VARIANTS, type ResumeVariant } from "@/lib/constants/documents";

// --- shared sub-schemas ---
const HomeBase = z.object({
  city: z.string(),
  stateOrCountry: z.string(),
  timezone: z.string(),
});

const ExperienceItem = z.object({
  title: z.string(),
  dates: z.string(),
  employer: z.string(),
  setting: z.string(),
  location: z.string(),
  contextLine: z.string(),
  bullets: z.array(z.string()),
});

const EducationItem = z.object({
  degree: z.string(),
  school: z.string(),
  location: z.string(),
  year: z.string(),
  honor: z.string(),
});

const Licensure = z.object({
  type: z.string(),
  state: z.string(),
  number: z.string(),
  status: z.string(),
  expires: z.string(),
});

/** Common to all three variants (ported from RESUME_COMMON_BASE_). */
const ResumeCommon = z.object({
  name: z.string(),
  headerRole: z.string(),
  email: z.string(),
  phone: z.string(),
  homeBase: HomeBase,
  workMode: z.string(),
  targetStart: z.string(),
  snapshot: z.string(),
  verificationLine: z.string(),
  experience: z.array(ExperienceItem),
  education: z.array(EducationItem),
});

// --- per-variant extraction schemas ---
export const ClinicalResumeSchema = ResumeCommon.extend({
  licensure: z.array(Licensure),
  npi: z.string(),
  caqhAttestedDate: z.string(),
  skills: z.object({
    modalities: z.array(z.string()),
    populations: z.array(z.string()),
  }),
});

export const PrescriberResumeSchema = ResumeCommon.extend({
  licensure: z.array(Licensure),
  boardCertifications: z.array(z.string()),
  npi: z.string(),
  dea: z.array(z.object({ state: z.string(), number: z.string() })),
  caqhAttestedDate: z.string(),
  hospitalAffiliations: z.array(
    z.object({ name: z.string(), role: z.string(), location: z.string(), dates: z.string() }),
  ),
  publications: z.array(z.string()),
  skills: z.object({
    modalities: z.array(z.string()),
    populations: z.array(z.string()),
  }),
});

export const OperationsResumeSchema = ResumeCommon.extend({
  coverageHours: z.string(),
  englishLevel: z.string(),
  referencesStatus: z.string(),
  systemsTools: z.array(z.string()),
  skills: z.object({ functional: z.array(z.string()) }),
});

export type ClinicalResume = z.infer<typeof ClinicalResumeSchema>;
export type PrescriberResume = z.infer<typeof PrescriberResumeSchema>;
export type OperationsResume = z.infer<typeof OperationsResumeSchema>;
/** Any extracted résumé (union across the three variants). */
export type ResumeData = ClinicalResume | PrescriberResume | OperationsResume;

/** The structured-output / validation schema for a given variant. */
export function resumeSchemaFor(variant: ResumeVariant) {
  switch (variant) {
    case "clinical":
      return ClinicalResumeSchema;
    case "prescriber":
      return PrescriberResumeSchema;
    case "operations":
      return OperationsResumeSchema;
  }
}

// --- API request/response contracts ---

/** Upper bound on résumé text we accept/store (matches the model-side char cap). */
export const MAX_RESUME_TEXT = 100_000;

/** POST /api/resume/extract — request. `text` is the client-side pdf.js extraction. */
export const parseResumeInputSchema = z.object({
  variant: z.enum(RESUME_VARIANTS),
  text: z.string().min(50, "Résumé text is too short to extract").max(MAX_RESUME_TEXT),
  // (vision fallback with a base64 PDF is a deferred fast-follow — re-added with a size guard then)
});
export type ParseResumeInput = z.infer<typeof parseResumeInputSchema>;

/**
 * Résumé → existing-candidate match. Enforces the no-silent-wrong-person-merge invariant:
 * `auto` (email-exact) pre-selects but the user still accepts; `confirm` (name-fuzzy) requires an
 * explicit toggle; `none` creates a new candidate. Recomputed server-side on save — never trusted
 * from the client.
 */
export type ResumeMatch =
  | {
      status: "auto";
      candidateId: string;
      candidateName: string;
      score: number;
      reason: "email-exact";
    }
  | {
      status: "confirm";
      candidateId: string;
      candidateName: string;
      score: number;
      reason: "name-fuzzy";
    }
  | { status: "none"; score: 0 };

/** POST /api/resume/extract — response (no candidate written yet). */
export interface ExtractResumeResponse {
  variant: ResumeVariant;
  data: ResumeData;
  match: ResumeMatch;
}

/** POST /api/resume/save — request. `confirmedCandidateId` is re-validated server-side. */
export const saveResumeInputSchema = z.object({
  variant: z.enum(RESUME_VARIANTS),
  data: z.record(z.string(), z.unknown()), // re-validated against resumeSchemaFor(variant) server-side
  originalFilename: z.string().max(255),
  mimeType: z.string().max(120),
  extractedText: z.string().max(MAX_RESUME_TEXT),
  confirmedCandidateId: z.string().optional(),
});
export type SaveResumeInput = z.infer<typeof saveResumeInputSchema>;
