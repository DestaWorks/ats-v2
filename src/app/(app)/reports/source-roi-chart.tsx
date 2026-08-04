"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SourceRoiRowDTO } from "@/lib/validation/reports";

/**
 * "Conversion % by source" headline chart (design pass 2026-08-04) — same reasoning as
 * `TeamPerformanceChart`: the table below has 5 metrics per row, so this surfaces just the one
 * metric this tab is actually about (ROI/conversion efficiency) at a glance; the table stays for
 * the full funnel-stage detail. Horizontal bars so source-name labels never need rotating.
 */
export function SourceRoiChart({ rows }: { rows: SourceRoiRowDTO[] }) {
  const data = rows.map((r) => ({ name: r.source, "Conv. %": Math.round(r.conversionPct ?? 0) }));
  const height = Math.max(120, data.length * 36);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" horizontal={false} />
          <XAxis
            type="number"
            unit="%"
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={110}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid rgb(0 0 0 / 0.08)", fontSize: 12 }}
          />
          <Bar dataKey="Conv. %" fill="#1e4a8a" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
