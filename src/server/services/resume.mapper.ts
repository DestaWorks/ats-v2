import "server-only";
import { CREDENTIALS, POPULATIONS, SETTINGS, type LicenseStatus } from "@/lib/constants";
import { VARIANT_TO_TRACK, type ResumeVariant } from "@/lib/constants/documents";
import type { ResumeData } from "@/lib/validation/resume";
import type { CandidateCreateInput } from "./candidate.service";

/**
 * Map an extracted résumé onto the Wave 1.1 Candidate columns (Wave 1.2 §4.5). Pure + unit-tested.
 * DELIBERATELY LOSSY: the extraction is far richer than the Candidate table — only the columns that
 * exist map here (credential/population/setting are collapsed onto the fixed vocab, unmapped → null;
 * operations carry no license). The full structured payload is preserved in `documents.extractedData`
 * by the service, so nothing is lost. `status` is NEVER set here — `create` forces `NEW_CANDIDATE`.
 */

/** Empty / whitespace-only string → null; otherwise the trimmed value. */
function emptyToNull(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** License state, dropping the legacy "—" placeholder used for non-state certs. */
function cleanLicenseState(state: string | undefined): string | null {
  const cleaned = emptyToNull(state);
  if (!cleaned || cleaned === "—") return null;
  return cleaned;
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

/** Parse a legacy "Mon YYYY" expiry into a Date (first of the month). null on anything else. */
function parseMonthYear(raw: string | undefined): Date | null {
  const cleaned = emptyToNull(raw);
  if (!cleaned) return null;
  const match = /([a-z]{3})[a-z]*\.?\s+(\d{4})/i.exec(cleaned);
  if (!match) return null;
  const month = MONTHS[match[1]!.toLowerCase()];
  if (month === undefined) return null;
  return new Date(Date.UTC(Number(match[2]), month, 1));
}

/** Map a free-text license status onto the fixed vocab; default "Not Verified". */
function mapLicenseStatus(raw: string | undefined): LicenseStatus {
  const value = (raw ?? "").toLowerCase();
  if (value.includes("active") || value.includes("certified") || value.includes("current")) {
    return "Active";
  }
  if (value.includes("expired")) return "Expired";
  if (value.includes("investigation")) return "Under Investigation";
  if (value.includes("not found")) return "Not Found";
  return "Not Verified";
}

/** Full-credential-name fragments → the fixed abbreviation vocab (for text with no abbreviation). */
const CREDENTIAL_NAME_MAP: ReadonlyArray<[RegExp, string]> = [
  [/psychiatric.*nurse practitioner/i, "PMHNP"],
  [/professional counselor/i, "LPC"],
  [/clinical social work/i, "LCSW"],
  [/master.*social work/i, "LMSW"],
  [/marriage and family/i, "LMFT"],
  [/mental health counselor/i, "LMHC"],
  [/nurse practitioner/i, "NP"],
  [/physician assistant/i, "PA"],
  [/physician|psychiatrist|(\bmd\b)/i, "MD"],
];

/**
 * Map a free-text credential/license type onto the fixed `CREDENTIALS` vocab. Checks explicit
 * abbreviations first (word-boundary, longest-first so "PMHNP-BC" beats "NP"), then full names.
 * Unmapped → null (never invents a credential).
 */
function mapCredential(type: string | undefined): string | null {
  const value = emptyToNull(type);
  if (!value) return null;

  const abbreviations = CREDENTIALS.filter((c) => c !== "Other").sort(
    (a, b) => b.length - a.length,
  );
  for (const abbr of abbreviations) {
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(value)) return abbr;
  }
  for (const [pattern, cred] of CREDENTIAL_NAME_MAP) {
    if (pattern.test(value)) return cred;
  }
  return null;
}

/** First value in `candidates` that maps (case-insensitive substring) onto a vocab entry. */
function pickVocab(candidates: readonly string[], vocab: readonly string[]): string | null {
  for (const raw of candidates) {
    const value = raw.toLowerCase();
    for (const entry of vocab) {
      if (value.includes(entry.toLowerCase())) return entry;
    }
  }
  return null;
}

/** Best population match from `skills.populations` (child/geriatric/lifespan/adult heuristics). */
function mapPopulation(populations: readonly string[]): string | null {
  const joined = populations.join(" ").toLowerCase();
  if (/child|adolescen|teen|pediatric|youth/.test(joined)) return "Child/Adolescent";
  if (/geriatric|older adult|elderly/.test(joined)) return "Geriatric";
  if (/lifespan|all ages/.test(joined)) return "Across the Lifespan";
  if (/adult/.test(joined)) return "Adult";
  return pickVocab(populations, POPULATIONS);
}

/** Best setting match from the experience settings + declared work mode. */
function mapSetting(data: ResumeData): string | null {
  const candidates = [...data.experience.map((e) => e.setting), data.workMode];
  return pickVocab(candidates, SETTINGS);
}

/**
 * Build the Candidate create input for a variant. `track` comes from the variant; operations carries
 * no license/credential. Rich fields (snapshot, DEA, NPI, publications, etc.) are NOT mapped here —
 * they live in `documents.extractedData`.
 */
export function toCandidateCreateInput(
  variant: ResumeVariant,
  data: ResumeData,
): CandidateCreateInput {
  const base: CandidateCreateInput = {
    name: data.name,
    email: emptyToNull(data.email),
    phone: emptyToNull(data.phone),
    city: emptyToNull(data.homeBase.city),
    state: emptyToNull(data.homeBase.stateOrCountry),
    employer: emptyToNull(data.experience[0]?.employer),
    track: VARIANT_TO_TRACK[variant],
    setting: mapSetting(data),
  };

  if (variant === "operations") {
    // No licensure, no clinical populations for the operations track.
    return { ...base, credential: null, population: null };
  }

  // clinical | prescriber — both carry `licensure` + `skills.populations`.
  const licensed = data as Extract<ResumeData, { licensure: unknown[] }>;
  const lic = licensed.licensure[0];
  return {
    ...base,
    credential: mapCredential(lic?.type),
    population: mapPopulation(licensed.skills.populations),
    licenseState: lic ? cleanLicenseState(lic.state) : null,
    licenseNumber: lic ? emptyToNull(lic.number) : null,
    licenseStatus: mapLicenseStatus(lic?.status),
    licenseExpiry: parseMonthYear(lic?.expires),
  };
}
