"use client";

import type { SourceRoiDTO } from "@/lib/validation/reports";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import { SourceRoiChart } from "./source-roi-chart";

export function SourceRoiTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<SourceRoiDTO>("/api/reports/source-roi", buildReportQuery(filters));

  return (
    <ReportTabShell data={data}>
      {(d) =>
        d.rows.length === 0 ? (
          <EmptyState title="No sourced candidates" description="Adjust the filters above." />
        ) : (
          <div className="flex flex-col gap-5">
            <Card as="section" className="flex flex-col gap-3 p-5">
              <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
                Conversion % by Source
              </h3>
              <SourceRoiChart rows={d.rows} />
            </Card>

            <Table
              caption="Source ROI"
              columns={["Source", "Total", "Screening+", "Submitted+", "Placed", "Conv. %"]}
            >
              {d.rows.map((r) => (
                <tr key={r.source}>
                  <Td className="font-medium">{r.source}</Td>
                  <Td className="tabular-nums">{r.total}</Td>
                  <Td className="tabular-nums">{r.screening}</Td>
                  <Td className="tabular-nums">{r.submitted}</Td>
                  <Td className="tabular-nums">{r.placed}</Td>
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
