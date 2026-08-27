"use client";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { GetReportsClientFunnelResponse } from "@/app/api/reports/client-funnel/route";

export function ClientFunnelTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsClientFunnelResponse>(
    "/api/reports/client-funnel",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) =>
        d.clients.length === 0 ? (
          <EmptyState title="No clients in this filter" description="Adjust the filters above." />
        ) : (
          <div className="flex flex-col gap-4">
            {d.clients.map((client) => (
              <Card key={client.clientId} as="section" className="flex flex-col gap-2 p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-lg font-bold text-charcoal">
                    {client.clientName}
                  </h3>
                  <span className="text-xs text-gray">{client.openRoles} open role(s)</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {client.stages.map((s) => (
                    <div key={s.status} className="flex items-center justify-between text-sm">
                      <span className="text-gray">{s.label}</span>
                      <span className="tabular-nums">
                        {s.current}{" "}
                        <span
                          className={cn(
                            "text-xs font-semibold",
                            s.delta > 0 ? "text-green" : s.delta < 0 ? "text-red" : "text-gray",
                          )}
                        >
                          ({s.delta > 0 ? "+" : ""}
                          {s.delta} WoW)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        )
      }
    </ReportTabShell>
  );
}
