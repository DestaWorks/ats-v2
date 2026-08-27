"use client";

import { useEffect, useState } from "react";
import type { HealthScoreDTO, RevenueDTO } from "@destaworks/contracts/validation/crm-analytics";
import type { GetCrmClientHealthResponse } from "@/app/api/crm/clients/[id]/health/route";
import type { GetCrmClientRevenueResponse } from "@/app/api/crm/clients/[id]/revenue/route";
import type { ClientHealthTier } from "@destaworks/domain/rules/client-health";
import { getJson } from "@/lib/api/client";
import { Badge, type BadgeTone } from "@destaworks/ui/badge";
import { StatCard } from "../../dashboard/stat-card";

// --- Health tab (Wave 4.2 flex — Health Score + Revenue/Profitability) --------------------------

const TIER_TONE: Record<ClientHealthTier, BadgeTone> = {
  Healthy: "success",
  "Needs Attention": "amber",
  "At Risk": "danger",
};

function money(n: number | null): string {
  if (n === null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

export function HealthTab({ clientId }: { clientId: string }) {
  const [health, setHealth] = useState<HealthScoreDTO | null | undefined>(undefined);
  const [revenue, setRevenue] = useState<RevenueDTO | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getJson<GetCrmClientHealthResponse>(`/api/crm/clients/${clientId}/health`).then((res) => {
      if (!cancelled) setHealth(res.ok ? res.data : null);
    });
    void getJson<GetCrmClientRevenueResponse>(`/api/crm/clients/${clientId}/revenue`).then(
      (res) => {
        if (!cancelled) setRevenue(res.ok ? res.data : null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (health === undefined || revenue === undefined) {
    return <p className="text-sm text-gray">Loading…</p>;
  }
  if (health === null || revenue === null) {
    return <p className="text-sm text-red">Couldn&apos;t load this client&apos;s health data.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-lg border border-black/10 bg-white shadow-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-charcoal">Health Score</h2>
          <div className="flex items-center gap-2">
            <span className="font-serif text-2xl font-bold text-navy">{health.score}</span>
            <Badge tone={TIER_TONE[health.tier]}>{health.tier}</Badge>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Pipeline (of 40)" value={health.breakdown.pipeline} />
          <StatCard label="Communication (of 35)" value={health.breakdown.communication} />
          <StatCard label="Tasks (of 25)" value={health.breakdown.tasks} />
        </div>
        <p className="mt-3 text-xs text-gray">
          {health.daysSinceLastTouch === null
            ? "No logged touches yet."
            : `Last touch: ${health.daysSinceLastTouch} day${health.daysSinceLastTouch === 1 ? "" : "s"} ago.`}
        </p>
      </section>

      <section className="rounded-lg border border-black/10 bg-white shadow-card p-4">
        <h2 className="mb-3 text-sm font-bold text-charcoal">Revenue &amp; Profitability</h2>
        {revenue.monthlyRate === null && revenue.avgPlacementFee === null ? (
          <p className="text-sm text-gray italic">
            Set a monthly rate / avg placement fee / gross margin in Edit to see projections.
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Lifetime Placements" value={revenue.lifetimePlacements} />
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
            <p className="text-xs font-semibold tracking-wide text-gray uppercase">
              Annualized Revenue
            </p>
            <p className="mt-1 text-2xl font-bold text-navy">{money(revenue.annualizedRevenue)}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
            <p className="text-xs font-semibold tracking-wide text-gray uppercase">Gross Profit</p>
            <p className="mt-1 text-2xl font-bold text-navy">{money(revenue.grossProfit)}</p>
          </div>
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4">
            <p className="text-xs font-semibold tracking-wide text-gray uppercase">ROI / Hour</p>
            <p className="mt-1 text-2xl font-bold text-navy">{money(revenue.roiPerHour)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray">
          <span>Hours invested (est.): {revenue.hoursInvested.toFixed(1)}</span>
          <span>Lifetime cumulative: {money(revenue.lifetimeCumulative)}</span>
          <span>
            Placements/year:{" "}
            {revenue.placementsPerYear !== null ? revenue.placementsPerYear.toFixed(2) : "—"}
          </span>
        </div>
      </section>
    </div>
  );
}
