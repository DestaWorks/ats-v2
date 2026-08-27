"use client";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { GetReportsClientPortfolioResponse } from "@/app/api/reports/client-portfolio/route";

export function ClientPortfolioTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsClientPortfolioResponse>(
    "/api/reports/client-portfolio",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) =>
        d.clients.length === 0 ? (
          <EmptyState title="No clients in this filter" description="Adjust the filters above." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {d.clients.map((client) => (
              <Card key={client.clientId} as="section" className="flex flex-col gap-2 p-5">
                <div className="flex items-start justify-between">
                  <h3 className="font-serif text-lg font-bold text-charcoal">
                    {client.clientName}
                  </h3>
                  {client.priority ? (
                    <span className="rounded-full bg-label px-2 py-0.5 text-[10px] font-bold tracking-wide text-navy uppercase">
                      {client.priority}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-charcoal">
                  <span>
                    <span className="font-semibold">{client.placed}</span> placed
                  </span>
                  <span>
                    <span className="font-semibold">{client.inPipeline}</span> in pipeline
                  </span>
                  <span>
                    Avg fit:{" "}
                    <span className="font-semibold">
                      {client.avgScorePct !== null ? `${Math.round(client.avgScorePct)}%` : "—"}
                    </span>
                  </span>
                  <span>
                    Avg days:{" "}
                    <span className="font-semibold">
                      {client.avgDaysInStage !== null ? Math.round(client.avgDaysInStage) : "—"}
                    </span>
                  </span>
                </div>
                <ul className="flex flex-col gap-0.5 text-xs text-gray">
                  {client.byStatus.map((s) => (
                    <li key={s.status} className="flex justify-between">
                      <span>{s.label}</span>
                      <span className="tabular-nums">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )
      }
    </ReportTabShell>
  );
}
