"use client";

import { useEffect, useState } from "react";
import type { DailySummaryDTO, DailyTotalsDTO } from "@destaworks/contracts/validation/daily-range";
import type { DateRange } from "@destaworks/domain/daily-range";
import { Card } from "@destaworks/ui/card";
import { MetricCard } from "@destaworks/ui/metric-card";
import { EmptyState } from "@destaworks/ui/empty-state";
import { cn } from "@destaworks/domain/utils/cn";
import { getJson } from "@/lib/api/client";

const METRICS = [
  { key: "sourced", label: "Sourced", accent: "navy" },
  { key: "outreach", label: "Outreach", accent: "purple" },
  { key: "responses", label: "Responses", accent: "green" },
  { key: "screenings", label: "Screenings", accent: "teal" },
  { key: "submitted", label: "Submitted", accent: "orange" },
] as const;

function delta(now: number, before: number): { label: string; direction: "up" | "down" } | null {
  // No prior activity is not a 100% rise — it is nothing to compare against, so say nothing.
  if (before === 0) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return {
    label: `${pct >= 0 ? "+" : ""}${pct}% vs previous`,
    direction: pct >= 0 ? "up" : "down",
  };
}

function Bars({ summary }: { summary: DailySummaryDTO }) {
  const peak = Math.max(1, ...summary.days.map((d) => d.sourced + d.outreach));
  return (
    <div className="flex items-end gap-1 overflow-x-auto pb-1">
      {summary.days.map((day) => {
        const total = day.sourced + day.outreach;
        return (
          <div key={day.date} className="flex min-w-6 flex-1 flex-col items-center gap-1">
            <div
              className={cn("w-full rounded-t", total > 0 ? "bg-navy" : "bg-black/5")}
              style={{ height: `${Math.max(2, (total / peak) * 72)}px` }}
              title={`${day.date}: ${total}`}
            />
            <span className="text-[9px] text-gray">{day.date.slice(8)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function RangeSummary({
  range,
  date,
  scope,
}: {
  range: DateRange;
  date: string;
  scope: "mine" | "team";
}) {
  const [summary, setSummary] = useState<DailySummaryDTO | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void getJson<DailySummaryDTO>(
      `/api/daily/summary?range=${range}&date=${date}&scope=${scope}`,
    ).then((res) => {
      if (!live) return;
      setSummary(res.ok ? res.data : null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [range, date, scope]);

  if (loading) return <Card className="p-6 text-sm text-gray">Loading…</Card>;
  if (summary === null) {
    return <Card className="p-6 text-sm text-gray">Couldn&apos;t load this period.</Card>;
  }

  const logged = summary.totals.daysLogged;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs font-bold tracking-wider text-gray uppercase">
          {summary.from} → {summary.to}
        </p>
        <p className="mt-0.5 text-sm text-gray">
          {logged} of {summary.daysInPeriod} day{summary.daysInPeriod === 1 ? "" : "s"} logged
        </p>
      </div>

      {logged === 0 ? (
        <EmptyState
          title="Nothing logged in this period"
          description="Switch to Day to log today's numbers, or pick another range."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {METRICS.map((metric) => {
              const value = summary.totals[metric.key as keyof DailyTotalsDTO];
              const before = summary.previous[metric.key as keyof DailyTotalsDTO];
              const target = summary.targets?.[metric.key as keyof DailyTotalsDTO] ?? null;
              return (
                <MetricCard
                  key={metric.key}
                  label={metric.label}
                  value={value}
                  accent={metric.accent}
                  sub={target !== null && target > 0 ? `target ${target}` : "no target set"}
                  delta={delta(value, before)}
                />
              );
            })}
          </div>

          {summary.days.length > 1 && (
            <Card className="p-4">
              <p className="mb-3 text-xs font-bold tracking-wider text-gray uppercase">
                Sourced + outreach per day
              </p>
              <Bars summary={summary} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
