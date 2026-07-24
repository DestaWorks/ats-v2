"use client";

import type { TeamPerformanceDTO } from "@/lib/validation/reports";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";

export function TeamPerformanceTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<TeamPerformanceDTO>(
    "/api/reports/team-performance",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyState title="No associate activity" description="Adjust the filters above." />
        ) : (
          <Table
            caption="Team performance"
            columns={[
              "Associate",
              "Added",
              "Screening+",
              "Submitted+",
              "Placed",
              "Avg Days in Stage",
              "Conv. %",
            ]}
          >
            {d.rows.map((r) => (
              <tr key={r.userId}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="tabular-nums">{r.added}</Td>
                <Td className="tabular-nums">{r.screening}</Td>
                <Td className="tabular-nums">{r.submitted}</Td>
                <Td className="tabular-nums">{r.placed}</Td>
                <Td className="tabular-nums">
                  {r.avgDaysInStage !== null ? Math.round(r.avgDaysInStage) : "—"}
                </Td>
                <Td className="tabular-nums">
                  {r.conversionPct !== null ? `${Math.round(r.conversionPct)}%` : "—"}
                </Td>
              </tr>
            ))}
          </Table>
        )
      }
    </ReportTabShell>
  );
}
