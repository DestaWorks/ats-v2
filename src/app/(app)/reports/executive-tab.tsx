"use client";

import type { ExecutiveSummaryDTO } from "@/lib/validation/reports";
import { Card } from "@/components/ui/card";
import { Table, Td } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "../dashboard/stat-card";
import { Bar, ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";

export function ExecutiveTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<ExecutiveSummaryDTO>(
    "/api/reports/executive",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) => (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total" value={d.total} />
            <StatCard label="Placed" value={d.placed} tone="green" />
            <StatCard label="In Review" value={d.inReview} />
            <StatCard label="At Client" value={d.atClient} tone="teal" />
            <StatCard label="Overdue" value={d.overdue} tone="orange" />
            <StatCard label="Flagged" value={d.flagged} tone="red" />
          </section>

          <Card as="section" className="flex flex-col gap-3 p-5">
            <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
              Pipeline Distribution
            </h3>
            <div className="flex flex-col gap-2">
              {d.distribution.map((s) => (
                <div key={s.status} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0 text-charcoal">{s.label}</span>
                  <Bar pct={s.pct} />
                  <span className="w-16 shrink-0 text-right text-gray tabular-nums">
                    {s.count} ({Math.round(s.pct)}%)
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <section>
            <h3 className="mb-2 text-sm font-bold tracking-wide text-navy uppercase">
              Top Candidates by Fit
            </h3>
            {d.topCandidates.length === 0 ? (
              <EmptyState
                title="No scored candidates"
                description="No candidate has a client fit score yet."
              />
            ) : (
              <Table caption="Top candidates by fit score" columns={["Name", "Client", "Score"]}>
                {d.topCandidates.map((c) => (
                  <tr key={c.id}>
                    <Td className="font-medium">{c.name}</Td>
                    <Td>{c.clientName ?? "—"}</Td>
                    <Td className="tabular-nums">{Math.round(c.scorePct)}%</Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </div>
      )}
    </ReportTabShell>
  );
}
