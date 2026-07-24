/**
 * CRM analytics contract (Wave 4.2 flex — Revenue/Health-Score/Compare, legacy
 * `index.html:7014-7025` health score, `:7176-7235` revenue, `:7330-7354` compare). Pure (NO
 * server imports).
 */
import type { ClientHealthBreakdown, ClientHealthTier } from "@/lib/rules/client-health";

export interface HealthScoreDTO {
  score: number;
  tier: ClientHealthTier;
  breakdown: ClientHealthBreakdown;
  daysSinceLastTouch: number | null;
}

export interface RevenueDTO {
  monthlyRate: number | null;
  avgPlacementFee: number | null;
  grossMargin: number | null;
  contractStart: string | null; // ISO
  lifetimePlacements: number;
  /** `null` when the inputs needed to compute it aren't set yet. */
  placementsPerYear: number | null;
  annualizedRevenue: number | null;
  grossProfit: number | null;
  hoursInvested: number;
  roiPerHour: number | null;
  lifetimeCumulative: number | null;
}

export interface CompareRowDTO {
  clientId: string;
  clientName: string;
  priority: string | null;
  cadence: string | null;
  pipelineCount: number;
  placedCount: number;
  activeCount: number;
  conversionPct: number | null;
  healthScore: number;
  healthTier: ClientHealthTier;
  lastContactDaysAgo: number | null;
}
