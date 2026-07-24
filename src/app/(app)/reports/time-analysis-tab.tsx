"use client";

import type { TimeAnalysisDTO } from "@/lib/validation/reports";
import { Table, Td } from "@/components/ui/table";
import { StatCard } from "../dashboard/stat-card";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";

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
            <StatCard label="Avg Time to Fill" value={d.timeToFill.avgDays ?? 0} />
            <StatCard label="Median Time to Fill" value={d.timeToFill.medianDays ?? 0} />
            <StatCard label="Placements" value={d.timeToFill.count} />
          </section>

          <Table caption="Time in stage" columns={["Stage", "Avg Days", "Max Days", "SLA (days)"]}>
            {d.timeInStage.map((s) => (
              <tr key={s.status}>
                <Td className="font-medium">{s.label}</Td>
                <Td className="tabular-nums">{s.avgDays !== null ? Math.round(s.avgDays) : "—"}</Td>
                <Td className="tabular-nums">{s.maxDays ?? "—"}</Td>
                <Td className="tabular-nums">{s.slaDays ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        </div>
      )}
    </ReportTabShell>
  );
}
