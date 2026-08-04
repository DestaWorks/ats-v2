"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExecutiveSummaryDTO } from "@/lib/validation/reports";

/**
 * Top-candidates leaderboard (design pass 2026-08-04) — replaces the former 3-column table
 * (name/client/score) entirely. A single metric (fit score) over a small, server-capped list
 * (top 10, `TOP_CANDIDATES_LIMIT`) is exactly what a horizontal bar leaderboard is for — every
 * candidate visible at once, ranked by length. The client name moves from its own column into
 * the tooltip rather than being dropped.
 */
export function TopCandidatesChart({
  candidates,
}: {
  candidates: ExecutiveSummaryDTO["topCandidates"];
}) {
  const data = candidates.map((c) => ({
    name: c.name,
    client: c.clientName ?? "Unassigned",
    Score: Math.round(c.scorePct),
  }));
  const height = Math.max(120, data.length * 32);

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(0 0 0 / 0.06)" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            unit="%"
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={120}
          />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: "1px solid rgb(0 0 0 / 0.08)", fontSize: 12 }}
            formatter={(value) => [`${value}%`, "Score"]}
            labelFormatter={(name) => {
              const row = data.find((d) => d.name === name);
              return row ? `${name} · ${row.client}` : name;
            }}
          />
          <Bar dataKey="Score" fill="#1e4a8a" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
