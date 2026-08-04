/**
 * Reports contract (Wave 5.2). Pure (NO server imports) — shared by every report route and the
 * `/reports` client. Filters mirror legacy's universal filter bar (client/associate/source/
 * credential/date-range) — one shape reused by every filtered report + CSV export, matching
 * legacy's single filtered cohort feeding every report. Client Capacity (originally the
 * standalone `/analytics` KPI view, legacy `vw="kpi"`) is unfiltered/all-time by design — see
 * `ClientCapacityDTO` below — so it takes no filters at all, same as Trends.
 */
import { z } from "zod";
import type { CandidateStatus } from "@/lib/constants";

export const reportFiltersSchema = z.object({
  clientId: z.string().min(1).optional(),
  createdById: z.string().min(1).optional(),
  source: z.string().min(1).optional(),
  credential: z.string().min(1).optional(),
  addedFrom: z.coerce.date().optional(),
  addedTo: z.coerce.date().optional(),
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/** Shared query-param → filters parsing, reused by every `/api/reports/*` route. */
export function reportFiltersFromParams(params: URLSearchParams): ReportFilters {
  return reportFiltersSchema.parse({
    clientId: params.get("clientId") ?? undefined,
    createdById: params.get("createdById") ?? undefined,
    source: params.get("source") ?? undefined,
    credential: params.get("credential") ?? undefined,
    addedFrom: params.get("addedFrom") ?? undefined,
    addedTo: params.get("addedTo") ?? undefined,
  });
}

// --- DTOs ------------------------------------------------------------------

export interface ExecutiveSummaryDTO {
  total: number;
  placed: number;
  inReview: number;
  atClient: number;
  overdue: number;
  flagged: number;
  distribution: { status: CandidateStatus; label: string; count: number; pct: number }[];
  topCandidates: { id: string; name: string; clientName: string | null; scorePct: number }[];
}

export interface PipelineFunnelStageDTO {
  status: CandidateStatus;
  label: string;
  reachedCount: number;
  /** % of the previous stage's `reachedCount` — null for the first stage. */
  conversionPct: number | null;
}
export interface PipelineFunnelDTO {
  stages: PipelineFunnelStageDTO[];
}

export interface ClientFunnelCardDTO {
  clientId: string;
  clientName: string;
  stages: {
    status: CandidateStatus;
    label: string;
    current: number;
    weekAgo: number;
    delta: number;
  }[];
  openRoles: number;
}
export interface ClientFunnelDTO {
  clients: ClientFunnelCardDTO[];
}

export interface JourneySegmentDTO {
  status: CandidateStatus;
  label: string;
  startDay: number; // days from the report window's start
  days: number; // segment length in days
}
export interface JourneyRowDTO {
  candidateId: string;
  name: string;
  clientName: string | null;
  segments: JourneySegmentDTO[];
}
export interface MassJourneyDTO {
  windowStart: string; // ISO date
  windowEnd: string; // ISO date
  totalCandidates: number;
  shownCount: number; // may be < totalCandidates (capped)
  medianDaysToPlace: number | null;
  p90DaysToPlace: number | null;
  bottleneckStages: { status: CandidateStatus; label: string; medianDays: number }[];
  rows: JourneyRowDTO[];
}

export interface TeamPerformanceRowDTO {
  userId: string;
  name: string;
  added: number;
  screening: number;
  submitted: number;
  placed: number;
  avgDaysInStage: number | null;
  conversionPct: number | null;
}
export interface TeamPerformanceDTO {
  rows: TeamPerformanceRowDTO[];
}

export interface SourceRoiRowDTO {
  source: string;
  total: number;
  screening: number;
  submitted: number;
  placed: number;
  conversionPct: number | null;
}
export interface SourceRoiDTO {
  rows: SourceRoiRowDTO[];
}

export interface ClientPortfolioCardDTO {
  clientId: string;
  clientName: string;
  priority: string | null;
  placed: number;
  inPipeline: number;
  avgScorePct: number | null;
  avgDaysInStage: number | null;
  byStatus: { status: CandidateStatus; label: string; count: number }[];
}
export interface ClientPortfolioDTO {
  clients: ClientPortfolioCardDTO[];
}

/**
 * Client Capacity (legacy `vw="kpi"`, `index.html:2827-2916` — originally a standalone Analytics
 * page; folded into Reports as its own tab, since By-Status/Client/Source, Time-to-Fill, and
 * Source-of-Hire all duplicated existing report tabs and this was the only genuinely unique
 * piece; see `docs/MODULE-BREAKDOWN.md` §25). Per-client capacity limits + an "approaching
 * capacity" alert — the numerator is ALL-TIME cumulative placements at that client (never
 * period-filtered, confirmed with Biruh — legacy's period-filtered numerator barely ever fired
 * outside "All Time"), so this DTO takes no filters at all.
 */
export interface ClientCapacityCardDTO {
  clientId: string;
  clientName: string;
  capacity: number;
  placed: number;
  pct: number;
  tone: "red" | "orange" | "green";
  approachingCapacity: boolean;
}
export interface ClientCapacityDTO {
  clients: ClientCapacityCardDTO[];
}

export interface TimeAnalysisDTO {
  timeInStage: {
    status: CandidateStatus;
    label: string;
    avgDays: number | null;
    maxDays: number | null;
    slaDays: number | null;
  }[];
  timeToFill: { avgDays: number | null; medianDays: number | null; count: number };
}

export interface ComplianceDTO {
  byLicenseStatus: { licenseStatus: string; count: number }[];
  requiringAction: {
    id: string;
    name: string;
    clientName: string | null;
    licenseStatus: string;
    reasons: string[];
  }[];
}

// --- Trends (Wave 5.2 flex — legacy's rolling W/M/Q Anomalies/Funnel/Trends block) -------------

export interface TrendsMetricDTO {
  key: "sourced" | "outreach" | "responses" | "promoted" | "submitted" | "hires";
  label: string;
  thisWeek: number;
  lastWeek: number;
  thisMonth: number;
  lastMonth: number;
  thisQuarter: number;
  lastQuarter: number;
  /** Week-horizon goal, or `null` for metrics with no tracked goal (Responses/Promoted/Submitted). */
  goal: number | null;
}

export interface TrendsAnomalyDTO {
  label: string;
  thisWeek: number;
  lastWeek: number;
  direction: "up" | "down";
  /** e.g. "42%" or "new" (when `lastWeek` was 0). */
  changeLabel: string;
}

export interface TrendsFunnelStageDTO {
  label: string;
  curr: number;
  prev: number;
  /** % of the PRECEDING stage's count, same period — `null` for the first stage (Sourced). */
  convCurrPct: number | null;
  convPrevPct: number | null;
}

export interface TrendsDTO {
  metrics: TrendsMetricDTO[];
  anomalies: TrendsAnomalyDTO[];
  funnel: TrendsFunnelStageDTO[];
}
