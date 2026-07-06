/**
 * Promote field-mapping (Wave 2.6, L-6) — the PURE helper that turns a source lead into the input
 * for `candidateService.create`. NOT `server-only`: pure + isomorphic so it is unit-tested in
 * isolation (the `CandidateCreateInput` import below is TYPE-ONLY, fully erased at runtime — it never
 * pulls the server-only candidate service in).
 *
 * A lead's sourcing fields are FREE TEXT (`credential` is a raw job title, `state`/`source` are typed
 * by hand), but the candidate columns are validated against the strict vocab (`CREDENTIALS` /
 * `US_STATES` / `SOURCES` / `TAGS`) that the pipeline gates + scorer rely on. So each value passes
 * through ONLY if it matches its enum, else it drops to `null` (or is filtered out for `tags`) — the
 * promote path can never inject invalid vocabulary. `track` defaults to Clinical (matches the create
 * contract); pipeline/license/status fields are NOT mapped (owned by the create contract / `move` /
 * `verify-license`). `legacyId` is intentionally not copied — the candidate gets its own namespace.
 */
import { CREDENTIALS, DEFAULT_TRACK, SOURCES, TAGS, US_STATES } from "@/lib/constants";
import type { CandidateCreateInput } from "./candidate.service";

/** The lead fields the mapper reads (a structural subset of a `SourceLead` row). */
export interface LeadForPromotion {
  name: string;
  email: string | null;
  phone: string | null;
  credential: string | null;
  state: string | null;
  source: string | null;
  tags: string[];
  clientId: string | null;
}

const CREDENTIAL_SET = new Set<string>(CREDENTIALS);
const STATE_SET = new Set<string>(US_STATES);
const SOURCE_SET = new Set<string>(SOURCES);
const TAG_SET = new Set<string>(TAGS);

/** Keep a free-text value only if it is a member of `set`, else `null` (the coercion primitive). */
function coerce(value: string | null, set: Set<string>): string | null {
  return value && set.has(value) ? value : null;
}

/**
 * Map a lead to the candidate-create input, coercing free-text sourcing vocab to the strict enums.
 * `state` seeds BOTH `state` and `licenseState` (a lead has one location field); a non-enum
 * `credential`/`state`/`source` drops to `null`; `tags` is filtered to valid `TAGS` members.
 */
export function leadToCandidateInput(lead: LeadForPromotion): CandidateCreateInput {
  const state = coerce(lead.state, STATE_SET);
  return {
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    state,
    licenseState: state,
    credential: coerce(lead.credential, CREDENTIAL_SET),
    source: coerce(lead.source, SOURCE_SET),
    tags: lead.tags.filter((t) => TAG_SET.has(t)),
    track: DEFAULT_TRACK,
    clientId: lead.clientId,
  };
}
