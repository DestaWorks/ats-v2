"use client";

import { CalendarIcon, CheckBadgeIcon, ClockIcon } from "@heroicons/react/24/outline";
import type { TimeAnalysisDTO } from "@/lib/validation/reports";
import { Card } from "@/components/ui/card";
import { StatCard } from "../dashboard/stat-card";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import { TimeInStageChart } from "./time-in-stage-chart";

export function TimeAnalysisTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<TimeAnalysisDTO>(
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
