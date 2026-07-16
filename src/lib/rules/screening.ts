/**
 * Screening scorecard scorer (Wave 3.3) — PURE + ISOMORPHIC (no `server-only`): ported verbatim
 * from legacy's inline scorer (`legacy/index.html:6731-6770`). The client may import this directly
 * for instant live-feedback as a recruiter fills out the form; the server independently and
 * authoritatively recomputes it at save-time and never trusts a client-submitted score (mirrors
 * `scoring.ts`'s "client mirrors for UX, server decision is authoritative" posture).
 *
 * One deliberate deviation from legacy: legacy's `clientRules.schedule` was always empty (a bug —
 * `CLIENT_RULES` never had a `schedule` key), so the "matches client schedule" branch below was
 * dead code in the original. This app wires real per-client schedule data
 * (`BASE_CLIENT_RULES`/`ClientRules.schedule`), so the branch is reachable — see
 * `docs/DECISIONS.md`'s "known client defects are corrected, not ported."
 */
import {
  CRED_REQS,
  COMM_ITEMS,
  SALARY_RANGES,
  type CredentialRequirement,
} from "@/lib/constants/screening";

export interface ScreeningInput {
  credential: string | null;
  credentialsHeld: readonly string[];
  statesHeld: readonly string[];
  yearsExp: number | null;
  schedule: string | null;
  salaryAsk: number | null;
  commChecklist: readonly string[];
}

export interface ScreeningClientRules {
  states: readonly string[];
  schedule: string | null;
}

export interface ScreeningSections {
  cred: number;
  state: number;
  exp: number;
  schedule: number;
  salary: number;
  comm: number;
}

export type ScreeningDecision = "Advance" | "Conditional" | "Hold";

export interface ScreeningResult {
  sections: ScreeningSections;
  totalPct: number;
  decision: ScreeningDecision;
}

/** Section weights (sum to 100) — legacy `weights` (`legacy/index.html:6733`). */
const WEIGHTS: ScreeningSections = {
  cred: 25,
  state: 20,
  exp: 20,
  schedule: 15,
  salary: 10,
  comm: 10,
};

const EMPTY_CRED_REQ: CredentialRequirement = {
  label: "",
  required: [],
  preferred: [],
  minYears: 0,
};

function scoreCredential(input: ScreeningInput): number {
  const req = CRED_REQS[input.credential ?? ""] ?? EMPTY_CRED_REQ;
  const reqTotal = req.required.length;
  const reqHave = input.credentialsHeld.filter((c) => req.required.includes(c)).length;
  const prefTotal = req.preferred.length;
  const prefHave = input.credentialsHeld.filter((c) => req.preferred.includes(c)).length;
  if (reqTotal === 0) return 0;
  return Math.round((reqHave / reqTotal) * 80 + (prefTotal > 0 ? (prefHave / prefTotal) * 20 : 20));
}

function scoreState(input: ScreeningInput, clientRules: ScreeningClientRules | null): number {
  const neededStates = clientRules?.states ?? [];
  if (neededStates.length === 0) return 50;
  const matched = neededStates.filter((s) => input.statesHeld.includes(s)).length;
  return Math.round((matched / neededStates.length) * 100);
}

function scoreExperience(input: ScreeningInput): number {
  const req = CRED_REQS[input.credential ?? ""];
  const minYrs = req?.minYears || 2;
  const yrs = input.yearsExp ?? 0;
  if (yrs >= minYrs + 3) return 100;
  if (yrs >= minYrs) return Math.round(60 + ((yrs - minYrs) / 3) * 40);
  if (yrs > 0) return Math.round((yrs / minYrs) * 60);
  return 0;
}

function scoreSchedule(input: ScreeningInput, clientRules: ScreeningClientRules | null): number {
  const schedule = input.schedule;
  const clientSched = clientRules?.schedule ?? "";
  if (!schedule) return 0;
  if (schedule === "Flexible / Open to Anything") return 100;
  const clientSchedFirstWord = clientSched.toLowerCase().split(" ")[0];
  if (
    clientSched &&
    clientSchedFirstWord &&
    schedule.toLowerCase().includes(clientSchedFirstWord)
  ) {
    return 100;
  }
  if (schedule.includes("Hybrid") && clientSched.includes("Hybrid")) return 100;
  return 40;
}

function scoreSalary(input: ScreeningInput): number {
  const range = SALARY_RANGES[input.credential ?? ""] ?? [0, 0];
  const [min, max] = range;
  const ask = input.salaryAsk ?? 0;
  if (!ask) return 0;
  if (ask >= min && ask <= max) return 100;
  if (ask < min) return Math.max(0, Math.round(100 - ((min - ask) / min) * 100));
  return Math.max(0, Math.round(100 - ((ask - max) / max) * 100));
}

function scoreCommunication(input: ScreeningInput): number {
  const commTotal = COMM_ITEMS.length;
  const commHave = COMM_ITEMS.filter((c) => input.commChecklist.includes(c.id)).length;
  return commTotal > 0 ? Math.round((commHave / commTotal) * 100) : 0;
}

function decide(totalPct: number): ScreeningDecision {
  if (totalPct >= 75) return "Advance";
  if (totalPct >= 60) return "Conditional";
  return "Hold";
}

/** Score a screening scorecard, out of 100 (ported from legacy's inline scorer). */
export function scoreScreening(
  input: ScreeningInput,
  clientRules: ScreeningClientRules | null,
): ScreeningResult {
  const sections: ScreeningSections = {
    cred: scoreCredential(input),
    state: scoreState(input, clientRules),
    exp: scoreExperience(input),
    schedule: scoreSchedule(input, clientRules),
    salary: scoreSalary(input),
    comm: scoreCommunication(input),
  };

  const weightSum = Object.values(WEIGHTS).reduce((s, w) => s + w * 100, 0);
  const weighted = (Object.keys(sections) as (keyof ScreeningSections)[]).reduce(
    (s, key) => s + sections[key] * WEIGHTS[key],
    0,
  );
  const totalPct = Math.round((weighted / weightSum) * 100);

  return { sections, totalPct, decision: decide(totalPct) };
}
