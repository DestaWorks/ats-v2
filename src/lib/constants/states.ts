/**
 * US states + the Nurse Licensure Compact (NLC) member states.
 * `COMPACT_STATES` ported verbatim from the legacy constant (37 states).
 */

export const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
] as const;
export type UsState = (typeof US_STATES)[number];

/** Nurse Licensure Compact member states (legacy `COMPACT_STATES`). */
export const COMPACT_STATES = [
  "AZ",
  "AR",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "ID",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MO",
  "MS",
  "MT",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NC",
  "ND",
  "OH",
  "OK",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

const COMPACT_SET = new Set<string>(COMPACT_STATES);

export function isCompactState(state: string | null | undefined): boolean {
  return state ? COMPACT_SET.has(state) : false;
}

/**
 * State licensing-board verification portals (legacy `LL`, ported verbatim — the License tab's
 * "verify on state board" link). Only the states the team actually verifies against carry a named
 * portal; `stateBoardLink` falls back to a license-lookup web search for every other state so the
 * verify workflow never dead-ends (legacy showed no link at all for unmapped states).
 */
export const STATE_BOARDS: Record<string, { name: string; url: string }> = {
  CT: { name: "CT eLicense Portal", url: "https://www.elicense.ct.gov/" },
  NJ: { name: "NJ Consumer Affairs", url: "https://newjersey.mylicense.com/" },
  FL: { name: "FL MQA", url: "https://mqa-internet.doh.state.fl.us/" },
  MA: { name: "MA Board", url: "https://checkalicense.mass.gov/" },
};

/** The board link for a license state — a named portal when mapped, else a search fallback. */
export function stateBoardLink(
  state: string | null | undefined,
): { name: string; url: string; mapped: boolean } | null {
  if (!state) return null;
  const board = STATE_BOARDS[state];
  if (board) return { ...board, mapped: true };
  return {
    name: `Search ${state} license verification`,
    url: `https://www.google.com/search?q=${encodeURIComponent(`${state} professional license verification lookup`)}`,
    mapped: false,
  };
}
