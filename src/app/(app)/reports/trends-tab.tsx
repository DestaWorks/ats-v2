"use client";

import { Fragment } from "react";
import type { TrendsDTO } from "@/lib/validation/reports";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { ReportTabShell } from "./lib/report-tab-shell";
import { useReportFetch } from "./lib/use-report-fetch";
import { TrendsChart } from "./trends-chart";

const HORIZONS = [
  { key: "Week", curr: "thisWeek", prev: "lastWeek" },
  { key: "Month", curr: "thisMonth", prev: "lastMonth" },
  { key: "Quarter", curr: "thisQuarter", prev: "lastQuarter" },
] as const;

function DeltaCell({ curr, prev }: { curr: number; prev: number }) {
  if (curr === 0 && prev === 0) return <span className="text-gray">—</span>;
  const delta = curr - prev;
  const pct = prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);
  const tone = delta > 0 ? "text-green" : delta < 0 ? "text-red" : "text-gray";
  const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "—";
  return (
    <span className={cn("font-semibold tabular-nums", tone)}>
      {arrow} {Math.abs(delta)}
      {pct !== null ? ` (${pct}%)` : ""}
    </span>
  );
}

/**
 * Trends (Wave 5.2 flex, legacy Weekly Brief's "DROP 50" block) — unfiltered/team-wide, so this
 * tab ignores the page's filter bar (matches legacy's own scope for this section).
 */
export function TrendsTab() {
  const data = useReportFetch<TrendsDTO>("/api/reports/trends", "");

  return (
    <ReportTabShell data={data}>
      {(d) => (
        <div className="flex flex-col gap-5">
          {d.anomalies.length > 0 ? (
            <Card as="section" className="flex flex-col gap-2 border-l-4 border-l-orange p-5">
              <h3 className="text-[11px] font-bold tracking-wide text-orange uppercase">
                ⚠ Anomalies · {d.anomalies.length} metric{d.anomalies.length === 1 ? "" : "s"} moved
                ≥30% week-over-week
              </h3>
              {d.anomalies.map((a) => (
                <p key={a.label} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={a.direction === "up" ? "text-green" : "text-red"}>
                    {a.direction === "up" ? "▲" : "▼"}
                  </span>
                  <span className="font-semibold text-charcoal">{a.label}</span>
                  <span className={a.direction === "up" ? "text-green" : "text-red"}>
                    {a.thisWeek} this week vs {a.lastWeek} last week ({a.changeLabel} {a.direction})
                  </span>
                  <span className="ml-auto text-xs text-gray">
                    {a.direction === "down" ? "investigate the leak" : "keep the momentum"}
                  </span>
                </p>
              ))}
            </Card>
          ) : null}

          <Card as="section" className="flex flex-col gap-3 p-5">
            <h3 className="text-[11px] font-bold tracking-wide text-navy uppercase">
              Conversion Funnel · This Week
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {d.funnel.map((s) => (
                <div key={s.label} className="rounded-lg border border-black/5 bg-black/[0.02] p-3">
                  <p className="text-[9px] font-bold tracking-wide text-gray uppercase">
                    {s.label}
                  </p>
                  <p className="font-serif text-xl font-bold text-charcoal">{s.curr}</p>
                  <p className="text-[10px] text-gray">last wk: {s.prev}</p>
                  {s.convCurrPct !== null ? (
                    <p className="mt-1 border-t border-black/5 pt-1 text-xs font-semibold text-navy">
                      {s.convCurrPct}%{" "}
                      <span className="font-normal text-gray">(was {s.convPrevPct ?? 0}%)</span>
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>

          <Card as="section" className="flex flex-col gap-3 p-5">
            <h3 className="text-[11px] font-bold tracking-wide text-navy uppercase">
              This Week vs Last Week
            </h3>
            <TrendsChart metrics={d.metrics} />
          </Card>

          <Card as="section" className="flex flex-col gap-3 p-5">
            <h3 className="text-[11px] font-bold tracking-wide text-navy uppercase">
              Trends · Week / Month / Quarter + Goal
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-black/10 text-[10px] font-bold tracking-wide text-gray uppercase">
                    <th className="py-1.5 pr-2">Metric</th>
                    <th className="py-1.5 pr-2 text-center">Hzn</th>
                    <th className="py-1.5 pr-2 text-right">Current</th>
                    <th className="py-1.5 pr-2 text-right">Prior</th>
                    <th className="py-1.5 pr-2 text-right">Δ vs Prior</th>
                    <th className="border-l border-black/5 py-1.5 pl-2 text-right">Goal (week)</th>
                  </tr>
                </thead>
                <tbody>
                  {d.metrics.map((m) => (
                    <Fragment key={m.key}>
                      {HORIZONS.map((h, i) => (
                        <tr key={`${m.key}-${h.key}`} className="border-b border-black/5">
                          {i === 0 ? (
                            <td
                              rowSpan={3}
                              className="border-r border-black/5 pr-2 align-top font-semibold text-charcoal"
                            >
                              {m.label}
                            </td>
                          ) : null}
                          <td className="py-1 text-center">
                            <span className="rounded bg-navy/10 px-1.5 py-0.5 text-[10px] font-bold text-navy">
                              {h.key[0]}
                            </span>
                          </td>
                          <td className="py-1 pr-2 text-right font-serif font-bold tabular-nums text-charcoal">
                            {m[h.curr]}
                          </td>
                          <td className="py-1 pr-2 text-right text-gray tabular-nums">
                            {m[h.prev]}
                          </td>
                          <td className="py-1 pr-2 text-right">
                            <DeltaCell curr={m[h.curr]} prev={m[h.prev]} />
                          </td>
                          {i === 0 ? (
                            <td
                              rowSpan={3}
                              className="border-l border-black/5 py-1 pl-2 text-right align-middle"
                            >
                              {m.goal !== null ? (
                                <span className="font-semibold tabular-nums">
                                  {m.thisWeek}/{m.goal} (
                                  {m.goal > 0 ? Math.round((m.thisWeek / m.goal) * 100) : 0}%)
                                </span>
                              ) : (
                                <span className="text-gray">—</span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray italic">
              Rolling windows: W = 7d, M = 30d, Q = 90d. Goal = sum of this week&apos;s daily
              targets (Sourced/Outreach) or the weekly placement goal (Hires).
            </p>
          </Card>
        </div>
      )}
    </ReportTabShell>
  );
}
