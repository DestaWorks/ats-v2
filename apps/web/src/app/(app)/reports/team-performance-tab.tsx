"use client";

import dynamic from "next/dynamic";
import { Card } from "@destaworks/ui/card";
import { EmptyState } from "@destaworks/ui/empty-state";
import { Table, Td } from "@destaworks/ui/table";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { TeamPerformanceDTO as GetReportsTeamPerformanceResponse } from "@destaworks/contracts/validation/reports";

// recharts is heavy — load it only once this tab actually renders (perf audit 2026-08-05).
const TeamPerformanceChart = dynamic(() =>
  import("./team-performance-chart").then((m) => m.TeamPerformanceChart),
);

export function TeamPerformanceTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsTeamPerformanceResponse>(
    "/api/reports/team-performance",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyState title="No associate activity" description="Adjust the filters above." />
        ) : (
          <div className="flex flex-col gap-5">
            <Card as="section" className="flex flex-col gap-3 p-5">
              <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
                Placed by Associate
              </h3>
              <TeamPerformanceChart rows={d.rows} />
            </Card>

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
          </div>
        )
      }
    </ReportTabShell>
  );
}
