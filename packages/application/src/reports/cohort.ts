import type { TenantContext } from "@destaworks/domain/tenant";
import { scoreCandidate } from "@destaworks/domain/rules/scoring";
import type { ClientRules } from "@destaworks/domain/rules/types";
import { utcDayStart, utcNextDayStart } from "@destaworks/domain/daily";
import { defined } from "@destaworks/domain/utils/defined";
import type { ReportFilters } from "@destaworks/contracts/validation/reports";
import {
  candidateRepository,
  type CandidateRow,
} from "@destaworks/db/repositories/candidate.repository";
import { toClientRules } from "@destaworks/db/repositories/client-rules.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { toRuleCandidate } from "../candidate.dto";
import {
  cachedClientNameMap,
  cachedClientRulesList,
} from "@destaworks/integrations/http/request-cache";

/** Row cap for the shared cohort read — a boutique-agency-scale ceiling, documented (matches the
 *  `TRASH_PAGE`-style cap precedent in `candidate.service.ts`), not a silent truncation: reports
 *  built on this cohort should surface a "showing first N" note if `rows.length === REPORT_ROW_CAP`. */
export const REPORT_ROW_CAP = 3000;

export interface ReportCohort {
  candidates: CandidateRow[];
  clientNames: Map<string, string>;
  userNames: Map<string, string>;
  rulesByClient: Map<string, ClientRules>;
  /** True when `candidates.length === REPORT_ROW_CAP` — the read may be truncated. */
  capped: boolean;
}

/**
 * The one filtered read every report derives from (legacy's single `rCands` array, loaded server-
 * side ONCE per request instead of recomputed per metric). `clientNames`/`userNames`/`rulesByClient`
 * are the same small "load once, map lookups after" bundle used throughout this codebase
 * (`clientRepository.nameMap(ctx)`, `userRepository.namesByIds()`, `buildRulesMap`-equivalent).
 */
export async function loadCohort(
  ctx: TenantContext,
  filters: ReportFilters,
): Promise<ReportCohort> {
  const [candidates, clientNames, rulesRows] = await Promise.all([
    candidateRepository.list(
      ctx,
      defined({
        clientId: filters.clientId,
        createdById: filters.createdById,
        source: filters.source,
        credential: filters.credential,
        addedFrom: filters.addedFrom ? utcDayStart(filters.addedFrom) : undefined,
        addedTo: filters.addedTo ? utcNextDayStart(filters.addedTo) : undefined,
        take: REPORT_ROW_CAP,
      }),
    ),
    cachedClientNameMap(ctx),
    cachedClientRulesList(ctx),
  ]);
  const userNames = await userRepository.namesByIds([
    ...new Set(candidates.map((c) => c.createdById).filter((id): id is string => !!id)),
  ]);
  const rulesByClient = new Map<string, ClientRules>();
  for (const r of rulesRows) {
    const name = clientNames.get(r.clientId);
    if (name) rulesByClient.set(r.clientId, toClientRules(r, name));
  }
  return {
    candidates,
    clientNames,
    userNames,
    rulesByClient,
    capped: candidates.length === REPORT_ROW_CAP,
  };
}

/**
 * A candidate's fit `pct` for its assigned client, or `null` when there's nothing to score
 * against (no client, or the client has no rules row) — shared by every report/export that shows
 * a fit score, so they can't disagree (mirrors `candidateService`'s own `scoreFor`).
 */
export function scoreFor(
  row: CandidateRow,
  rulesByClient: Map<string, ClientRules>,
  now: Date,
): number | null {
  if (!row.clientId) return null;
  const rules = rulesByClient.get(row.clientId);
  if (!rules) return null;
  const { pct, max } = scoreCandidate(toRuleCandidate(row), rules, now);
  return max > 0 ? pct : null;
}
