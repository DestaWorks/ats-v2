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
import type { TimeAnalysisDTO } from "@destaworks/contracts/validation/reports";

/**
 * "Time in stage" grouped bar chart (design pass 2026-08-04) — replaces the former table
 * entirely. A fixed ~9-stage, 3-metric (avg/max/SLA days) comparison is exactly the shape a
 * grouped bar chart handles better than a table: every stage is visible at once, no scrolling,
 * and the SLA bar makes an over-budget stage immediately obvious rather than requiring a
 * column-by-column read. `null` metrics (no data yet for that stage) render as 0-height bars,
 * same as the table rendered them as "—".
 */
export function TimeInStageChart({ timeInStage }: { timeInStage: TimeAnalysisDTO["timeInStage"] }) {
  const data = timeInStage.map((s) => ({
    label: s.label,
    "Avg days": s.avgDays ?? 0,
    "Max days": s.maxDays ?? 0,
    "SLA (days)": s.slaDays ?? 0,
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 32 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "rgb(0 0 0 / 0.1)" }}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid rgb(0 0 0 / 0.08)", fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Avg days" fill="#1e4a8a" radius={[4, 4, 0, 0]} />
          <Bar dataKey="Max days" fill="#8b7355" radius={[4, 4, 0, 0]} />
          <Bar dataKey="SLA (days)" fill="#00897b" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
