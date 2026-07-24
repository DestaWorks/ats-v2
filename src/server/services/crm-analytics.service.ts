import "server-only";
import { statusOrder, type CandidateStatus } from "@/lib/constants";
import { computeHealthScore } from "@/lib/rules/client-health";
import type { CompareRowDTO, HealthScoreDTO, RevenueDTO } from "@/lib/validation/crm-analytics";
import { isoOrNull } from "@/lib/utils/iso";
import {
  candidateRepository,
  FIRST_TERMINAL_ORDER,
} from "@/server/repositories/candidate.repository";
import { clientRepository, type ClientRow } from "@/server/repositories/client.repository";
import { clientNoteRepository } from "@/server/repositories/client-note.repository";
import { clientMeetingRepository } from "@/server/repositories/client-meeting.repository";
import { clientTaskRepository } from "@/server/repositories/client-task.repository";
import { dealRepository } from "@/server/repositories/deal.repository";
import { AppError } from "@/server/http/app-error";

const MS_PER_DAY = 86_400_000;
/** Legacy's 15-min-per-touch proxy (`index.html:7190`) — applied only to REAL touch tables
 *  (notes/tasks/meetings/deals), never a generic activity-log scan, so it stays accurate once
 *  Gmail sync lands (auto-pulled emails won't silently inflate this unless deliberately added). */
const HOURS_PER_TOUCH = 0.25;

async function requireClient(id: string): Promise<ClientRow> {
  const client = await clientRepository.findById(id);
  if (!client) throw new AppError("NOT_FOUND", "Client not found");
  return client;
}

interface HealthInputs {
  totalCandidates: number;
  activeCandidateCount: number;
  placedCount: number;
  daysSinceLastTouch: number | null;
  doneTaskCount: number;
  totalTaskCount: number;
  touchCount: number; // notes + meetings + deals + tasks — feeds Revenue's hoursInvested proxy
}

/**
 * The raw inputs `computeHealthScore` (the ONE canonical formula, `lib/rules/client-health.ts`)
 * needs — shared by `healthScore()` and every row of `compare()` so they can never re-drift into
 * legacy's 3-divergent-formulas bug (they call the same pure function on the same inputs, not
 * three independent approximations).
 */
async function gatherHealthInputs(clientId: string, now: Date): Promise<HealthInputs> {
  const [statusGroups, notes, meetings, deals, tasks] = await Promise.all([
    candidateRepository.groupByStatusFiltered({ clientId }),
    clientNoteRepository.listForClient(clientId),
    clientMeetingRepository.listForClient(clientId),
    dealRepository.listForClient(clientId),
    clientTaskRepository.listForClient(clientId),
  ]);

  const totalCandidates = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
  const activeCandidateCount = statusGroups
    .filter((g) => statusOrder(g.status as CandidateStatus) < FIRST_TERMINAL_ORDER)
    .reduce((sum, g) => sum + g._count._all, 0);
  const placedCount = statusGroups.find((g) => g.status === "STARTED_DAY1")?._count._all ?? 0;

  const touchTimes = [
    ...notes.map((n) => n.createdAt.getTime()),
    ...meetings.map((m) => m.createdAt.getTime()),
    ...deals.map((d) => d.updatedAt.getTime()),
  ];
  const daysSinceLastTouch =
    touchTimes.length > 0
      ? Math.floor((now.getTime() - Math.max(...touchTimes)) / MS_PER_DAY)
      : null;

  const doneTaskCount = tasks.filter((t) => t.status === "done").length;

  return {
    totalCandidates,
    activeCandidateCount,
    placedCount,
    daysSinceLastTouch,
    doneTaskCount,
    totalTaskCount: tasks.length,
    touchCount: notes.length + meetings.length + deals.length + tasks.length,
  };
}

export const crmAnalyticsService = {
  async healthScore(clientId: string): Promise<HealthScoreDTO> {
    await requireClient(clientId);
    const inputs = await gatherHealthInputs(clientId, new Date());
    const result = computeHealthScore(inputs);
    return { ...result, daysSinceLastTouch: inputs.daysSinceLastTouch };
  },

  async revenue(clientId: string): Promise<RevenueDTO> {
    const client = await requireClient(clientId);
    const inputs = await gatherHealthInputs(clientId, new Date());
    const hoursInvested = inputs.touchCount * HOURS_PER_TOUCH;

    let placementsPerYear: number | null = null;
    let annualizedRevenue: number | null = null;
    let grossProfit: number | null = null;
    let roiPerHour: number | null = null;
    let lifetimeCumulative: number | null = null;

    if (client.contractStart) {
      const now = Date.now();
      const contractAgeDays = (now - client.contractStart.getTime()) / MS_PER_DAY;
      const durYears = Math.max(contractAgeDays / 365, 0.25); // floor: 3 months (legacy parity)
      placementsPerYear = inputs.placedCount / durYears;
      const retainerARR = (client.monthlyRate ?? 0) * 12;
      const placementARR = placementsPerYear * (client.avgPlacementFee ?? 0);
      annualizedRevenue = retainerARR + placementARR;
      if (client.grossMargin != null) {
        grossProfit = annualizedRevenue * (client.grossMargin / 100);
        roiPerHour = hoursInvested > 0 ? grossProfit / hoursInvested : null;
      }
      lifetimeCumulative =
        inputs.placedCount * (client.avgPlacementFee ?? 0) +
        (client.monthlyRate ?? 0) * (contractAgeDays / 30);
    }

    return {
      monthlyRate: client.monthlyRate,
      avgPlacementFee: client.avgPlacementFee,
      grossMargin: client.grossMargin,
      contractStart: isoOrNull(client.contractStart),
      lifetimePlacements: inputs.placedCount,
      placementsPerYear,
      annualizedRevenue,
      grossProfit,
      hoursInvested,
      roiPerHour,
      lifetimeCumulative,
    };
  },

  async compare(): Promise<CompareRowDTO[]> {
    const now = new Date();
    const clients = await clientRepository.list();
    return Promise.all(
      clients.map(async (c) => {
        const inputs = await gatherHealthInputs(c.id, now);
        const health = computeHealthScore(inputs);
        return {
          clientId: c.id,
          clientName: c.name,
          priority: c.priority,
          cadence: c.cadence,
          pipelineCount: inputs.totalCandidates,
          placedCount: inputs.placedCount,
          activeCount: inputs.activeCandidateCount,
          conversionPct:
            inputs.totalCandidates > 0
              ? Math.round((inputs.placedCount / inputs.totalCandidates) * 100)
              : null,
          healthScore: health.score,
          healthTier: health.tier,
          lastContactDaysAgo: inputs.daysSinceLastTouch,
        };
      }),
    );
  },
};
