"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TeamPerformanceRowDTO } from "@/lib/validation/reports";

/**
 * "Placed by associate" headline chart (design pass 2026-08-04) — the table below has 6 metrics
 * per row (added/screening/submitted/placed/avg days/conv%), which don't compress into one
 * legible chart without losing precision, so this shows just the single most business-relevant
 * metric (placements) at a glance; the table stays for the full multi-metric detail. Horizontal
 * bars (`layout="vertical"`) so associate-name labels never need rotating or truncating.
 */
export function TeamPerformanceChart({ rows }: { rows: TeamPerformanceRowDTO[] }) {
  const data = rows.map((r) => ({ name: r.name, Placed: r.placed }));
  const height = Math.max(120, data.length * 36);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} />
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
          <Bar dataKey="Placed" fill="#1e4a8a" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
