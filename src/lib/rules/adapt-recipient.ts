/**
 * Dual-recipient adapter (Wave 4.1, legacy `index.html:3679-3683`) — PURE + ISOMORPHIC. Normalizes
 * a candidate OR a sourced lead into the one `TemplateRecipient` shape `fillTemplate` expects, so
 * the token engine runs identically regardless of who's being written to.
 *
 * Leads leave clinical fields (`licenseNumber`/`licenseStatus`/`npi`/`yearsExp`/`specialty`/
 * `employer`/`population`/`setting`/`telehealthPref`) `null` — leads don't track them, matching
 * legacy's synthesized `cand` object. `specialty`/`targetLocations` are `null` for BOTH recipient
 * types: neither `Candidate` nor `SourceLead` has a column for them in this schema (legacy's own
 * `{targetLocations}` token checked two inconsistently-cased keys, `TargetLocation`/`targetLocation`,
 * suggesting it was never reliably populated there either). `fillTemplate`'s existing bracket-
 * placeholder fallback already handles every `null` correctly — no special-casing needed here.
 */
import type { TemplateRecipient } from "./fill-template";

/** Input shape: the fields `CandidateProfileDTO` / `CandidateListItemDTO` (extended, see below) carry. */
export interface CandidateRecipientSource {
  name: string;
  credential: string | null;
  licenseState: string | null;
  licenseNumber?: string | null;
  licenseStatus: string | null;
  yearsExp: number | null;
  employer: string | null;
  population: string | null;
  setting: string | null;
  telehealthPref: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
}

export function adaptCandidateToRecipient(c: CandidateRecipientSource): TemplateRecipient {
  return {
    name: c.name,
    credential: c.credential,
    licenseState: c.licenseState,
    licenseNumber: c.licenseNumber ?? null,
    licenseStatus: c.licenseStatus,
    npi: null,
    yearsExp: c.yearsExp,
    specialty: null,
    employer: c.employer,
    population: c.population,
    setting: c.setting,
    telehealthPref: c.telehealthPref,
    city: c.city,
    email: c.email,
    phone: c.phone,
    targetLocations: null,
  };
}

/** Input shape: the fields `LeadListItemDTO` / `LeadDetailDTO` carry. */
export interface LeadRecipientSource {
  name: string;
  credential: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
}

export function adaptLeadToRecipient(l: LeadRecipientSource): TemplateRecipient {
  return {
    name: l.name,
    credential: l.credential,
    licenseState: l.state,
    licenseNumber: null,
    licenseStatus: null,
    npi: null,
    yearsExp: null,
    specialty: null,
    employer: null,
    population: null,
    setting: null,
    telehealthPref: null,
    city: null,
    email: l.email,
    phone: l.phone,
    targetLocations: null,
  };
}
