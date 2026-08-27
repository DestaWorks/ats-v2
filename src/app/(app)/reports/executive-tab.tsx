"use client";

import dynamic from "next/dynamic";
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  FlagIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import type { ExecutiveSummaryDTO } from "@/lib/validation/reports";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "../dashboard/stat-card";
import { Bar, ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { GetReportsExecutiveResponse } from "@/app/api/reports/executive/route";

// recharts is heavy — load it only once this tab actually renders (perf audit 2026-08-05).
const TopCandidatesChart = dynamic(() =>
  import("./top-candidates-chart").then((m) => m.TopCandidatesChart),
);

export function ExecutiveTab({
  filters,
  initial,
}: {
  filters: ReportFilterState;
  initial?: ExecutiveSummaryDTO;
}) {
  const data = useReportFetch<GetReportsExecutiveResponse>(
    "/api/reports/executive",
    buildReportQuery(filters),
    initial,
  );

  return (
    <ReportTabShell data={data}>
      {(d) => (
        <div className="flex flex-col gap-5">
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Total" value={d.total} icon={UserGroupIcon} />
            <StatCard label="Placed" value={d.placed} tone="green" icon={CheckCircleIcon} />
            <StatCard label="In Review" value={d.inReview} icon={MagnifyingGlassIcon} />
            <StatCard label="At Client" value={d.atClient} tone="teal" icon={BuildingOffice2Icon} />
            <StatCard label="Overdue" value={d.overdue} tone="orange" icon={ClockIcon} />
            <StatCard label="Flagged" value={d.flagged} tone="red" icon={FlagIcon} />
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

          <Card as="section" className="flex flex-col gap-3 p-5">
            <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
              Top Candidates by Fit
            </h3>
            {d.topCandidates.length === 0 ? (
              <EmptyState
                title="No scored candidates"
                description="No candidate has a client fit score yet."
              />
            ) : (
              <TopCandidatesChart candidates={d.topCandidates} />
            )}
          </Card>
        </div>
      )}
    </ReportTabShell>
  );
}
