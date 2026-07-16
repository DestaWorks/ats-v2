import "server-only";
import { SCREENING_ELIGIBLE_STATUSES, statusLabel, type CandidateStatus } from "@/lib/constants";
import { scoreScreening, type ScreeningClientRules } from "@/lib/rules/screening";
import type {
  SaveScreeningInput,
  ScreeningCandidateDTO,
  ScreeningResultDTO,
  ScreeningScorecardDTO,
} from "@/lib/validation/screening";
import { toIso } from "@/lib/utils/iso";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { clientRulesRepository } from "@/server/repositories/client-rules.repository";
import {
  screeningRepository,
  type ScreeningScorecardRow,
} from "@/server/repositories/screening.repository";
import { AppError } from "@/server/http/app-error";
import { candidateService } from "./candidate.service";

function toResultDTO(row: ScreeningScorecardRow): ScreeningResultDTO {
  return {
    sections: {
      cred: row.credScore,
      state: row.stateScore,
      exp: row.expScore,
      schedule: row.scheduleScore,
      salary: row.salaryScore,
      comm: row.commScore,
    },
    totalPct: row.totalPct,
    decision: row.decision as ScreeningResultDTO["decision"],
  };
}

function toScorecardDTO(
  row: ScreeningScorecardRow,
  moved: { toStatus: CandidateStatus } | null,
): ScreeningScorecardDTO {
  return {
    id: row.id,
    candidateId: row.candidateId,
    result: toResultDTO(row),
    notes: row.notes,
    scoredById: row.scoredById,
    scoredAt: toIso(row.scoredAt),
    moved,
  };
}

/**
 * Screening scorecard (Wave 3.3) — the 6-section weighted candidate scorer + the
 * score-then-conditionally-move flow. Kept out of `candidate.service.ts` (already ~1150 lines,
 * over CONVENTIONS §3's ~400-line flag) — still calls `candidateService.move` directly, in-process,
 * the same precedent `bulkMove` already sets.
 */
export const screeningService = {
  /** Candidates eligible for screening (the picker) — scoped to the 3 legacy-eligible stages. */
  async listEligibleCandidates(search: string | undefined): Promise<ScreeningCandidateDTO[]> {
    const [rows, clientNames, rulesRows] = await Promise.all([
      candidateRepository.list({
        statuses: [...SCREENING_ELIGIBLE_STATUSES],
        search,
        take: 20,
      }),
      clientRepository.nameMap(),
      clientRulesRepository.list(),
    ]);
    const rulesByClient = new Map(rulesRows.map((r) => [r.clientId, r]));
    return rows.map((c) => {
      const rules = c.clientId ? rulesByClient.get(c.clientId) : undefined;
      return {
        id: c.id,
        name: c.name,
        credential: c.credential,
        licenseState: c.licenseState,
        statusLabel: statusLabel(c.status as CandidateStatus),
        clientId: c.clientId,
        clientName: c.clientId ? (clientNames.get(c.clientId) ?? null) : null,
        clientStates: rules?.states ?? [],
        clientSchedule: rules?.schedule ?? null,
        yearsExp: c.yearsExp,
      };
    });
  },

  /**
   * Score a candidate and persist the scorecard; if `action` is `advance`/`futurePipeline`, also
   * move the candidate — but only after re-validating the requested action against the SERVER's
   * own computed score (never trusts the client's clicked button alone). The scorecard is always
   * persisted before a move is attempted, so a `STAGE_BLOCKED` from `move` never loses the
   * recruiter's scoring work.
   */
  async saveAndMaybeMove(
    candidateId: string,
    input: SaveScreeningInput,
    user: AuthUser,
  ): Promise<ScreeningScorecardDTO> {
    const candidate = await candidateRepository.findById(candidateId);
    if (!candidate) throw new AppError("NOT_FOUND", "Candidate not found");

    const rulesRows = candidate.clientId ? await clientRulesRepository.list() : [];
    const rulesRow = rulesRows.find((r) => r.clientId === candidate.clientId) ?? null;
    const clientRules: ScreeningClientRules | null = rulesRow
      ? { states: rulesRow.states, schedule: rulesRow.schedule }
      : null;

    const result = scoreScreening(
      {
        credential: candidate.credential,
        credentialsHeld: input.credentialsHeld,
        statesHeld: input.statesHeld,
        yearsExp: input.yearsExp ?? null,
        schedule: input.schedule ?? null,
        salaryAsk: input.salaryAsk ?? null,
        commChecklist: input.commChecklist,
      },
      clientRules,
    );

    if (input.action === "advance" && result.totalPct < 75) {
      throw new AppError("BAD_REQUEST", "Score below 75% — cannot advance");
    }
    if (input.action === "futurePipeline" && result.totalPct >= 60) {
      throw new AppError("BAD_REQUEST", "Score is 60%+ — not eligible for Future Pipeline");
    }

    const row = await withTransaction(async (tx) => {
      const created = await screeningRepository.create(
        {
          candidateId,
          clientId: candidate.clientId,
          credentialsHeld: input.credentialsHeld,
          statesHeld: input.statesHeld,
          yearsExp: input.yearsExp ?? null,
          schedule: input.schedule ?? null,
          salaryAsk: input.salaryAsk ?? null,
          commChecklist: input.commChecklist,
          credScore: result.sections.cred,
          stateScore: result.sections.state,
          expScore: result.sections.exp,
          scheduleScore: result.sections.schedule,
          salaryScore: result.sections.salary,
          commScore: result.sections.comm,
          totalPct: result.totalPct,
          decision: result.decision,
          notes: input.notes ?? null,
          scoredById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "candidate",
        entityId: candidateId,
        actor: user.id,
        action: "screening_scored",
        after: { totalPct: result.totalPct, decision: result.decision },
      });
      return created;
    });

    let moved: { toStatus: CandidateStatus } | null = null;
    if (input.action === "advance") {
      const updated = await candidateService.move(candidateId, "SUBMITTED_TO_CLIENT", user);
      moved = { toStatus: updated.status as CandidateStatus };
    } else if (input.action === "futurePipeline") {
      const updated = await candidateService.move(candidateId, "FUTURE_PIPELINE", user);
      moved = { toStatus: updated.status as CandidateStatus };
    }

    return toScorecardDTO(row, moved);
  },
};
