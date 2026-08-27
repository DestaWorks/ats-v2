import "server-only";
import {
  ACTIVE_STATUS_CODES,
  statusLabel,
  type CandidateStatus,
} from "@destaworks/domain/constants";
import type { PipelineHealthDTO } from "@destaworks/contracts/validation/pipeline-health";
import { candidateRepository } from "@destaworks/db/repositories/candidate.repository";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { generatePipelineHealth } from "@destaworks/integrations/ai/pipeline-health/pipeline-health";

const MS_PER_DAY = 86_400_000;
const TOP_OVERDUE_LIMIT = 5;

/**
 * AI Pipeline Health strip (Wave 5.5 backlog, legacy `ats_pipeline_health` — Drop 53). Team-wide,
 * unfiltered — same shared counts `candidateService.listBoard`'s `meta` already computes, plus a
 * small "who's most overdue" context list the AI needs to be specific rather than generic.
 */
export const pipelineHealthService = {
  async generate(): Promise<PipelineHealthDTO> {
    const now = new Date();
    const [totalActive, overdueCount, stuckCount, overdueRows, clientNames] = await Promise.all([
      candidateRepository.count({ statuses: [...ACTIVE_STATUS_CODES] }),
      candidateRepository.count({ overdue: true }),
      candidateRepository.count({ stuck: true }),
      candidateRepository.topOverdue(TOP_OVERDUE_LIMIT, now),
      clientRepository.nameMap(),
    ]);

    const topOverdue = overdueRows.map((row) => ({
      name: row.name,
      clientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
      stage: statusLabel(row.status as CandidateStatus),
      daysInStage: Math.floor((now.getTime() - row.stageEnteredAt.getTime()) / MS_PER_DAY),
    }));

    return generatePipelineHealth({
      totalActive,
      overdueCount,
      stuckCount,
      topOverdue,
    });
  },
};
