"use client";

import { Card } from "@/components/ui/card";
import { Bar, ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { GetReportsPipelineFunnelResponse } from "@/app/api/reports/pipeline-funnel/route";

export function PipelineFunnelTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsPipelineFunnelResponse>(
    "/api/reports/pipeline-funnel",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) => {
        const max = Math.max(1, ...d.stages.map((s) => s.reachedCount));
        return (
          <Card as="section" className="flex flex-col gap-3 p-5">
            <p className="text-xs text-gray">
              Candidates who EVER reached this stage or beyond (from real stage history — a
              candidate later rejected still counts toward the stages they actually passed through).
            </p>
            {d.stages.map((s) => (
              <div key={s.status} className="flex items-center gap-3 text-sm">
                <span className="w-44 shrink-0 text-charcoal">{s.label}</span>
                <Bar pct={(s.reachedCount / max) * 100} />
                <span className="w-36 shrink-0 text-right text-gray tabular-nums">
                  {s.reachedCount}
                  {s.conversionPct !== null ? ` (${Math.round(s.conversionPct)}% conv.)` : ""}
                </span>
              </div>
            ))}
          </Card>
        );
      }}
    </ReportTabShell>
  );
}
