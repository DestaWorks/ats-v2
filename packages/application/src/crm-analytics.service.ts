import "server-only";
import { MS_PER_DAY, systemClock, type Clock } from "@destaworks/domain/clock";
import { statusOrder, type CandidateStatus } from "@destaworks/domain/constants";
import { elapsedMonths } from "@destaworks/domain/daily";
import {
  add,
  fromMajorUnits,
  multiply,
  percentOf,
  toMajorUnits,
  type CurrencyCode,
} from "@destaworks/domain/money";
import { computeHealthScore } from "@destaworks/domain/rules/client-health";
import type {
  CompareRowDTO,
  HealthScoreDTO,
  RevenueDTO,
} from "@destaworks/contracts/validation/crm-analytics";
import { isoOrNull } from "@destaworks/domain/utils/iso";
import {
  candidateRepository,
  FIRST_TERMINAL_ORDER,
} from "@destaworks/db/repositories/candidate.repository";
import { clientRepository, type ClientRow } from "@destaworks/db/repositories/client.repository";
import { clientNoteRepository } from "@destaworks/db/repositories/client-note.repository";
import { clientMeetingRepository } from "@destaworks/db/repositories/client-meeting.repository";
import { clientTaskRepository } from "@destaworks/db/repositories/client-task.repository";
import { dealRepository } from "@destaworks/db/repositories/deal.repository";
import { AppError } from "@destaworks/integrations/http/app-error";

/** The currency every stored `Int` money column (`monthlyRate`/`avgPlacementFee`) is denominated
 *  in — whole MAJOR units in the DB, widened to `Money` minor units before any arithmetic. */
const BILLING_CURRENCY: CurrencyCode = "USD";

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
/** Pure aggregation shared by the single-client and batched (`compare()`) paths — same inputs,
 *  just sourced from either one client's reads or a bucket sliced out of a batched read. */
function computeHealthInputs(
  statusGroups: { status: string; _count: { _all: number } }[],
  notes: { createdAt: Date }[],
  meetings: { createdAt: Date }[],
  deals: { updatedAt: Date }[],
  tasks: { status: string }[],
  now: Date,
): HealthInputs {
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

async function gatherHealthInputs(clientId: string, now: Date): Promise<HealthInputs> {
  const [statusGroups, notes, meetings, deals, tasks] = await Promise.all([
    candidateRepository.groupByStatusFiltered({ clientId }),
    clientNoteRepository.listForClient(clientId),
    clientMeetingRepository.listForClient(clientId),
    dealRepository.listForClient(clientId),
    clientTaskRepository.listForClient(clientId),
  ]);
  return computeHealthInputs(statusGroups, notes, meetings, deals, tasks, now);
}

/** Bucket a batched read by `clientId` — the shared groupBy-into-Map step every input needs. */
function byClient<T extends { clientId: string | null }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    if (!row.clientId) continue;
    const bucket = map.get(row.clientId);
    if (bucket) bucket.push(row);
    else map.set(row.clientId, [row]);
  }
  return map;
}

/**
 * Same as `gatherHealthInputs`, for EVERY client in one shot — `/crm/compare`'s health inputs
 * (perf audit 2026-08-15). Was `gatherHealthInputs` called once per client (5 queries × N
 * clients); this fires 5 queries total, batched across all clients, then buckets each result set
 * by `clientId` client-side.
 */
async function gatherHealthInputsForClients(
  clientIds: string[],
  now: Date,
): Promise<Map<string, HealthInputs>> {
  const [statusGroups, notes, meetings, deals, tasks] = await Promise.all([
    candidateRepository.groupByStatusForClients(clientIds),
    clientNoteRepository.listForClients(clientIds),
    clientMeetingRepository.listForClients(clientIds),
    dealRepository.listForClients(clientIds),
    clientTaskRepository.listForClients(clientIds),
  ]);

  const statusGroupsByClient = byClient(statusGroups);
  const notesByClient = byClient(notes);
  const meetingsByClient = byClient(meetings);
  const dealsByClient = byClient(deals);
  const tasksByClient = byClient(tasks);

  const result = new Map<string, HealthInputs>();
  for (const clientId of clientIds) {
    result.set(
      clientId,
      computeHealthInputs(
        statusGroupsByClient.get(clientId) ?? [],
        notesByClient.get(clientId) ?? [],
        meetingsByClient.get(clientId) ?? [],
        dealsByClient.get(clientId) ?? [],
        tasksByClient.get(clientId) ?? [],
        now,
      ),
    );
  }
  return result;
}

export const crmAnalyticsService = {
  async healthScore(clientId: string, clock: Clock = systemClock): Promise<HealthScoreDTO> {
    await requireClient(clientId);
    const inputs = await gatherHealthInputs(clientId, clock.now());
    const result = computeHealthScore(inputs);
    return { ...result, daysSinceLastTouch: inputs.daysSinceLastTouch };
  },

  async revenue(clientId: string, clock: Clock = systemClock): Promise<RevenueDTO> {
    const now = clock.now();
    const client = await requireClient(clientId);
    const inputs = await gatherHealthInputs(clientId, now);
    const hoursInvested = inputs.touchCount * HOURS_PER_TOUCH;

    let placementsPerYear: number | null = null;
    let annualizedRevenue: number | null = null;
    let grossProfit: number | null = null;
    let roiPerHour: number | null = null;
    let lifetimeCumulative: number | null = null;

    if (client.contractStart) {
      const monthlyRate = fromMajorUnits(client.monthlyRate ?? 0, BILLING_CURRENCY);
      const placementFee = fromMajorUnits(client.avgPlacementFee ?? 0, BILLING_CURRENCY);
      const contractAgeDays = (now.getTime() - client.contractStart.getTime()) / MS_PER_DAY;
      const durYears = Math.max(contractAgeDays / 365, 0.25); // floor: 3 months (legacy parity)
      placementsPerYear = inputs.placedCount / durYears;
      const annualized = add(multiply(monthlyRate, 12), multiply(placementFee, placementsPerYear));
      annualizedRevenue = toMajorUnits(annualized);
      if (client.grossMargin != null) {
        const profit = percentOf(annualized, client.grossMargin);
        grossProfit = toMajorUnits(profit);
        roiPerHour = hoursInvested > 0 ? toMajorUnits(profit) / hoursInvested : null;
      }
      lifetimeCumulative = toMajorUnits(
        add(
          multiply(placementFee, inputs.placedCount),
          multiply(monthlyRate, elapsedMonths(client.contractStart, now)),
        ),
      );
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

  async compare(clock: Clock = systemClock): Promise<CompareRowDTO[]> {
    const now = clock.now();
    const clients = await clientRepository.list();
    const inputsByClient = await gatherHealthInputsForClients(
      clients.map((c) => c.id),
      now,
    );
    return clients.map((c) => {
      const inputs = inputsByClient.get(c.id) ?? {
        totalCandidates: 0,
        activeCandidateCount: 0,
        placedCount: 0,
        daysSinceLastTouch: null,
        doneTaskCount: 0,
        totalTaskCount: 0,
        touchCount: 0,
      };
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
    });
  },
};
