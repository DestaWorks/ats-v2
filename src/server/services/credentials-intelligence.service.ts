import "server-only";
import type {
  CredentialsOverviewDTO,
  CoverageMatrixCellDTO,
  GapAnalysisRowDTO,
  NlcHolderDTO,
} from "@/lib/validation/credentials";
import { COMPACT_STATES } from "@/lib/constants";
import { credentialsIntelligenceRepository } from "@/server/repositories/credentials-intelligence.repository";
import { clientRulesRepository } from "@/server/repositories/client-rules.repository";
import { clientRepository } from "@/server/repositories/client.repository";

/** NLC tracker row cap — a leadership summary, not a full list; matches other dashboard caps. */
const NLC_HOLDER_CAP = 20;
/** Screening/submitted stage-order buckets for gap analysis (legacy: STATUSES.indexOf 1-2 / ≥3). */
const SCREENING_ORDER_MIN = 1;
const SCREENING_ORDER_MAX = 2;
const SUBMITTED_ORDER_MIN = 3;
const PLACED_ORDER = 8; // STARTED_DAY1

/**
 * Credentials Intelligence (Wave 3.6) — a read-only leadership dashboard: 6 stat cards, a
 * credential×state coverage matrix, client×credential gap analysis, and an NLC compact-license
 * tracker. Deliberately reuses NOTHING from `licenseVerifyService` at the DTO level (that
 * service's queue/timeline are CAPPED for its own UI; the stat cards here need true totals) —
 * only the underlying `Candidate` fields and the same `stageOrder < FIRST_TERMINAL_ORDER` "active
 * work" convention. The Verification Queue / Expiry Timeline themselves are NOT re-rendered here;
 * the dashboard links out to `/license-verify` instead of duplicating that UI.
 */
export const credentialsIntelligenceService = {
  async overview(now: Date = new Date()): Promise<CredentialsOverviewDTO> {
    const [stats, matrixCounts, gapCandidates, nlcHolderRows, rulesRows, clientNames] =
      await Promise.all([
        credentialsIntelligenceRepository.statCounts(now),
        credentialsIntelligenceRepository.matrixCounts(),
        credentialsIntelligenceRepository.gapAnalysisCandidates(),
        credentialsIntelligenceRepository.nlcCompactHolders(NLC_HOLDER_CAP),
        clientRulesRepository.list(),
        clientRepository.nameMap(),
      ]);

    return {
      stats,
      matrix: buildMatrix(matrixCounts, rulesRows),
      gapAnalysis: buildGapAnalysis(gapCandidates, rulesRows, clientNames),
      nlcHolders: nlcHolderRows.map(toNlcHolderDTO),
    };
  },
};

function toNlcHolderDTO(row: {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
}): NlcHolderDTO {
  return {
    id: row.id,
    name: row.name,
    credential: row.credential,
    licenseState: row.licenseState,
    additionalStatesCount: COMPACT_STATES.length - 1,
  };
}

type MatrixCounts = Awaited<ReturnType<typeof credentialsIntelligenceRepository.matrixCounts>>;
type RulesRows = Awaited<ReturnType<typeof clientRulesRepository.list>>;

/** Composite key for the credential/state maps below — "::" can't collide with a real
 *  credential or state code (none of `CREDENTIALS`/`US_STATES` contain it). */
function cellKey(credential: string, state: string): string {
  return `${credential}::${state}`;
}

function buildMatrix(
  { totals, unverified }: MatrixCounts,
  rulesRows: RulesRows,
): CredentialsOverviewDTO["matrix"] {
  const unverifiedByKey = new Map(
    unverified.map((r) => [
      cellKey(r.credential as string, r.licenseState as string),
      r._count._all,
    ]),
  );

  // "Needed": every (credential, state) pair some client's rules require.
  const neededPairs = new Map<string, { credential: string; state: string }>();
  for (const rules of rulesRows) {
    for (const c of rules.creds) {
      for (const s of rules.states) neededPairs.set(cellKey(c, s), { credential: c, state: s });
    }
  }

  const credentials = new Set(totals.map((r) => r.credential as string));
  const states = new Set(totals.map((r) => r.licenseState as string));

  const cells: CoverageMatrixCellDTO[] = totals.map((r) => {
    const credential = r.credential as string;
    const state = r.licenseState as string;
    const total = r._count._all;
    return {
      credential,
      state,
      total,
      unverified: unverifiedByKey.get(cellKey(credential, state)) ?? 0,
      needed: total === 0 && neededPairs.has(cellKey(credential, state)),
    };
  });

  // Also surface needed-but-entirely-absent pairs (zero rows in `totals` at all) as GAP cells —
  // otherwise a client requirement with NO candidates anywhere for that combo never appears.
  for (const { credential, state } of neededPairs.values()) {
    const exists = cells.some((c) => c.credential === credential && c.state === state);
    if (!exists) {
      cells.push({ credential, state, total: 0, unverified: 0, needed: true });
      credentials.add(credential);
      states.add(state);
    }
  }

  return {
    states: Array.from(states).sort(),
    credentials: Array.from(credentials).sort(),
    cells,
  };
}

type GapCandidates = Awaited<
  ReturnType<typeof credentialsIntelligenceRepository.gapAnalysisCandidates>
>;

function buildGapAnalysis(
  candidates: GapCandidates,
  rulesRows: RulesRows,
  clientNames: Map<string, string>,
): GapAnalysisRowDTO[] {
  // Every candidate row here is already "in pipeline" (repository scopes to active stages).
  const byClientCred = new Map<string, GapCandidates>();
  for (const c of candidates) {
    if (!c.clientId || !c.credential) continue;
    const key = cellKey(c.clientId, c.credential);
    const bucket = byClientCred.get(key);
    if (bucket) bucket.push(c);
    else byClientCred.set(key, [c]);
  }

  const rows: GapAnalysisRowDTO[] = [];
  for (const rules of rulesRows) {
    for (const credential of rules.creds) {
      const inPipelineRows = byClientCred.get(cellKey(rules.clientId, credential)) ?? [];
      const verified = inPipelineRows.filter((c) => c.licenseStatus === "Active").length;
      const screening = inPipelineRows.filter(
        (c) => c.stageOrder >= SCREENING_ORDER_MIN && c.stageOrder <= SCREENING_ORDER_MAX,
      ).length;
      const submitted = inPipelineRows.filter((c) => c.stageOrder >= SUBMITTED_ORDER_MIN).length;
      const placed = inPipelineRows.filter((c) => c.stageOrder === PLACED_ORDER).length;
      rows.push({
        clientId: rules.clientId,
        clientName: clientNames.get(rules.clientId) ?? "Unknown client",
        credential,
        inPipeline: inPipelineRows.length,
        verified,
        screening,
        submitted,
        placed,
        gap: inPipelineRows.length === 0,
      });
    }
  }
  return rows;
}
