"use client";

import dynamic from "next/dynamic";
import { CalendarIcon, CheckBadgeIcon, ClockIcon } from "@heroicons/react/24/outline";
import { Card } from "@/components/ui/card";
import { StatCard } from "../dashboard/stat-card";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { GetReportsTimeAnalysisResponse } from "@/app/api/reports/time-analysis/route";

// recharts is heavy — load it only once this tab actually renders (perf audit 2026-08-05).
const TimeInStageChart = dynamic(() =>
  import("./time-in-stage-chart").then((m) => m.TimeInStageChart),
);

export function TimeAnalysisTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsTimeAnalysisResponse>(
    "/api/reports/time-analysis",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) => (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-3 gap-3">
            <StatCard label="Avg Time to Fill" value={d.timeToFill.avgDays ?? 0} icon={ClockIcon} />
            <StatCard
              label="Median Time to Fill"
              value={d.timeToFill.medianDays ?? 0}
              icon={CalendarIcon}
            />
            <StatCard
              label="Placements"
              value={d.timeToFill.count}
              tone="green"
              icon={CheckBadgeIcon}
            />
          </section>

          <Card as="section" className="flex flex-col gap-3 p-5">
            <h3 className="text-sm font-bold tracking-wide text-navy uppercase">Time in Stage</h3>
            <TimeInStageChart timeInStage={d.timeInStage} />
          </Card>
        </div>
      )}
    </ReportTabShell>
  );
}
