"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendsMetricDTO } from "@/lib/validation/reports";

/**
 * This-week-vs-last-week grouped bar chart (design pass 2026-08-04) — the one report tab that's
 * genuinely time-series data with no chart at all before this (just the table below it, which
 * stays — it also covers Month/Quarter, this chart is the headline "at a glance" view of the
 * week horizon). Colors reuse the existing brand tokens (navy = current, brand tan = prior)
 * rather than introducing a new palette.
 */
export function TrendsChart({ metrics }: { metrics: TrendsMetricDTO[] }) {
  const data = metrics.map((m) => ({
    label: m.label,
    "This week": m.thisWeek,
    "Last week": m.lastWeek,
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgb(0 0 0 / 0.1)" }}
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid rgb(0 0 0 / 0.08)", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="This week" fill="#1e4a8a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Last week" fill="#8b7355" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
