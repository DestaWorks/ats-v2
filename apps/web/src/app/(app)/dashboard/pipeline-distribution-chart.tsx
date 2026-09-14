"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { CandidateStatus } from "@destaworks/domain/constants";
import { STATUS_HEX } from "../pipeline/lib/status-style";

export interface PipelineDistributionColumn {
  status: CandidateStatus;
  label: string;
  count: number;
}

/**
 * Pipeline Distribution donut (design pass 2026-08-03) — replaces the former stacked flex-grow
 * bar with a real Recharts donut + center-total label, matching the reference dashboards'
 * "breakdown by category" idiom (Amanah CRM's "Applications", theHaven's "Listing status
 * distribution"). Same data the RSC already computes from `dashboardStats` — no new fetch, purely
 * a rendering swap. Colors come from `STATUS_HEX` (real hex, not Tailwind classes — Recharts sets
 * actual SVG `fill` values).
 */
export function PipelineDistributionChart({
  columns,
  total,
}: {
  columns: PipelineDistributionColumn[];
  total: number;
}) {
  return (
    <div className="relative h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={columns}
            dataKey="count"
            nameKey="label"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={2}
            stroke="none"
          >
            {columns.map((col) => (
              <Cell key={col.status} fill={STATUS_HEX[col.status]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid rgb(0 0 0 / 0.08)",
              fontSize: 12,
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-2xl font-bold text-charcoal">{total}</p>
        <p className="text-xs text-gray">candidates</p>
      </div>
    </div>
  );
}
