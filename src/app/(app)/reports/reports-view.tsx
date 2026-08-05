"use client";

import { useState } from "react";
import { DetailTabs, type TabDef } from "@/components/ui/tabs";
import type { ExecutiveSummaryDTO } from "@/lib/validation/reports";
import type { ReportFilterOptionsDTO } from "@/server/services/reports/filter-options.service";
import { PrintButton } from "../credentials/print-button";
import { ClientCapacityTab } from "./client-capacity-tab";
import { ClientFunnelTab } from "./client-funnel-tab";
import { ClientPortfolioTab } from "./client-portfolio-tab";
import { ComplianceTab } from "./compliance-tab";
import { ExecutiveTab } from "./executive-tab";
import { ReportFilterBar } from "./filter-bar";
import { EMPTY_FILTERS, buildReportQuery } from "./lib/use-report-fetch";
import { MassJourneyTab } from "./mass-journey-tab";
import { PipelineFunnelTab } from "./pipeline-funnel-tab";
import { SourceRoiTab } from "./source-roi-tab";
import { TeamPerformanceTab } from "./team-performance-tab";
import { TimeAnalysisTab } from "./time-analysis-tab";
import { TrendsTab } from "./trends-tab";

/**
 * Reports (Wave 5.2, legacy `vw="reports"`) — universal filter bar + 10 server-computed reports
 * as tabs (Client Capacity folded in from the standalone Analytics page 2026-08-03). Only the
 * active tab's panel mounts (`DetailTabs`), so each report fetches lazily and refetches on tab
 * switch/filter change — fine for read-only report GETs.
 */
export function ReportsView({
  options,
  initialExecutive,
}: {
  options: ReportFilterOptionsDTO;
  initialExecutive?: ExecutiveSummaryDTO;
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);

  const tabs: TabDef[] = [
    {
      key: "executive",
      label: "Executive",
      panel: <ExecutiveTab filters={filters} initial={initialExecutive} />,
    },
    {
      key: "pipeline-funnel",
      label: "Pipeline Funnel",
      panel: <PipelineFunnelTab filters={filters} />,
    },
    {
      key: "client-funnel",
      label: "Per-Client Funnel",
      panel: <ClientFunnelTab filters={filters} />,
    },
    { key: "mass-journey", label: "Mass Journey", panel: <MassJourneyTab filters={filters} /> },
    {
      key: "team-performance",
      label: "Team Performance",
      panel: <TeamPerformanceTab filters={filters} />,
    },
    { key: "source-roi", label: "Source ROI", panel: <SourceRoiTab filters={filters} /> },
    {
      key: "client-portfolio",
      label: "Client Portfolio",
      panel: <ClientPortfolioTab filters={filters} />,
    },
    {
      key: "client-capacity",
      label: "Client Capacity",
      panel: <ClientCapacityTab />,
    },
    { key: "time-analysis", label: "Time Analysis", panel: <TimeAnalysisTab filters={filters} /> },
    { key: "compliance", label: "Compliance", panel: <ComplianceTab filters={filters} /> },
    { key: "trends", label: "Trends", panel: <TrendsTab /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 print:hidden">
        <ReportFilterBar filters={filters} onChange={setFilters} options={options} />
        <div className="flex shrink-0 gap-2">
          <a
            href={`/api/reports/export?${buildReportQuery(filters)}`}
            className="inline-flex h-9 items-center rounded-md border border-black/15 px-3 text-sm font-semibold text-navy hover:bg-black/[0.03]"
          >
            Export CSV
          </a>
          <PrintButton />
        </div>
      </div>
      <DetailTabs tabs={tabs} ariaLabel="Reports" />
    </div>
  );
}
