"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { seriesColor } from "./chart-palette";

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  /** Overrides the categorical palette when a slice has a meaning of its own (health, status). */
  color?: string;
}

/**
 * A donut with a centred total and an optional legend.
 *
 * Renders a flat ring when every slice is zero, so an empty installation reads as "nothing yet"
 * rather than as a chart that failed to load.
 */
export function DonutChart({
  slices,
  total,
  caption,
  height = 180,
  legend = true,
}: {
  slices: DonutSlice[];
  /** Shown in the middle. Defaults to the sum, but a caller may show something else. */
  total?: number;
  caption?: string;
  height?: number;
  legend?: boolean;
}) {
  const sum = slices.reduce((acc, s) => acc + s.value, 0);
  const middle = total ?? sum;
  const empty = sum === 0;
  const data = empty ? [{ key: "empty", label: "None", value: 1 }] : slices;

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ height, width: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius="64%"
              outerRadius="100%"
              paddingAngle={empty ? 0 : 2}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((slice, i) => (
                <Cell
                  key={slice.key}
                  fill={empty ? "rgba(0,0,0,0.06)" : (slice.color ?? seriesColor(i))}
                />
              ))}
            </Pie>
            {empty ? null : (
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,.1)" }}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-charcoal">{middle}</span>
          {caption ? <span className="text-[10px] text-gray">{caption}</span> : null}
        </div>
      </div>

      {legend ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {slices.length === 0 ? (
            <li className="text-sm text-gray">Nothing to show</li>
          ) : (
            slices.map((slice, i) => (
              <li key={slice.key} className="flex items-center gap-2 text-sm">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color ?? seriesColor(i) }}
                />
                <span className="min-w-0 flex-1 truncate text-charcoal">{slice.label}</span>
                <span className="tabular-nums text-gray">{slice.value}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
