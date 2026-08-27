"use client";

import { ChartBarIcon, ClockIcon, EyeIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { Card } from "@destaworks/ui/card";
import { EmptyState } from "@destaworks/ui/empty-state";
import { StatCard } from "../dashboard/stat-card";
import { ReportTabShell } from "./lib/report-tab-shell";
import { buildReportQuery, useReportFetch, type ReportFilterState } from "./lib/use-report-fetch";
import type { GetReportsMassJourneyResponse } from "@/app/api/reports/mass-journey/route";

/** One accent per active stage (order 0-8), cycling — a fixed, readable palette for the Gantt bars. */
const SEGMENT_COLORS = [
  "bg-navy",
  "bg-teal",
  "bg-purple",
  "bg-brand",
  "bg-orange",
  "bg-amber",
  "bg-green",
  "bg-red",
  "bg-charcoal",
];

function windowDaysBetween(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

export function MassJourneyTab({ filters }: { filters: ReportFilterState }) {
  const data = useReportFetch<GetReportsMassJourneyResponse>(
    "/api/reports/mass-journey",
    buildReportQuery(filters),
  );

  return (
    <ReportTabShell data={data}>
      {(d) => {
        const totalDays = windowDaysBetween(d.windowStart, d.windowEnd);
        return (
          <div className="flex flex-col gap-5">
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Candidates" value={d.totalCandidates} icon={UserGroupIcon} />
              <StatCard
                label="Median Days to Place"
                value={d.medianDaysToPlace ?? 0}
                icon={ClockIcon}
              />
              <StatCard
                label="P90 Days to Place"
                value={d.p90DaysToPlace ?? 0}
                icon={ChartBarIcon}
              />
              <StatCard label="Shown" value={d.shownCount} icon={EyeIcon} />
            </section>

            {d.bottleneckStages.length > 0 ? (
              <Card as="section" className="flex flex-col gap-2 p-5">
                <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
                  Bottleneck Stages (median days)
                </h3>
                <div className="flex flex-wrap gap-2">
                  {d.bottleneckStages.map((b) => (
                    <span
                      key={b.status}
                      className="rounded-full bg-orange/10 px-3 py-1 text-xs font-semibold text-orange"
                    >
                      {b.label}: {Math.round(b.medianDays)}d
                    </span>
                  ))}
                </div>
              </Card>
            ) : null}

            <Card as="section" className="flex flex-col gap-1 overflow-x-auto p-5">
              <div className="mb-2 flex items-center justify-between text-xs text-gray">
                <span>{d.windowStart}</span>
                <span>
                  Showing {d.shownCount} of {d.totalCandidates} candidates, most recently active
                  first
                </span>
                <span>{d.windowEnd}</span>
              </div>
              {d.rows.length === 0 ? (
                <EmptyState title="No candidates in this window" />
              ) : (
                <div className="flex min-w-[720px] flex-col gap-1.5">
                  {d.rows.map((row) => (
                    <div key={row.candidateId} className="flex items-center gap-3">
                      <span
                        className="w-40 shrink-0 truncate text-xs text-charcoal"
                        title={row.name}
                      >
                        {row.name}
                      </span>
                      <div className="relative h-4 flex-1 rounded bg-black/[0.04]">
                        {row.segments.map((seg, i) => (
                          <div
                            key={i}
                            title={`${seg.label} — ${seg.days}d`}
                            className={`absolute top-0 h-full rounded-sm ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`}
                            style={{
                              left: `${(seg.startDay / totalDays) * 100}%`,
                              width: `${Math.max(0.5, (seg.days / totalDays) * 100)}%`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        );
      }}
    </ReportTabShell>
  );
}
