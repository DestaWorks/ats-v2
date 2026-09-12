"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { seriesColor } from "./chart-palette";

export interface TrendPoint {
  /** X value. Rendered verbatim, so format it for a human before passing it in. */
  label: string;
  value: number;
}

/**
 * A filled trend over a DENSE series — every bucket present, including the empty ones.
 *
 * Density matters: a sparse series lets a reader mistake "nothing happened that day" for "no data
 * that day", and the area silently compresses quiet stretches. Producers fill the gaps; this
 * component assumes they did.
 */
export function TrendChart({
  points,
  height = 140,
  color = seriesColor(0),
  valueLabel = "Value",
  compact = false,
}: {
  points: TrendPoint[];
  height?: number;
  color?: string;
  valueLabel?: string;
  /** Drops the axes and grid — for a sparkline inside a stat card. */
  compact?: boolean;
}) {
  if (points.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-md bg-black/[0.03] text-xs text-gray"
        style={{ height }}
      >
        No data in this window
      </div>
    );
  }

  const gradientId = `trend-${color.replace("#", "")}`;

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={points}
          margin={
            compact
              ? { top: 4, right: 0, bottom: 0, left: 0 }
              : { top: 8, right: 8, bottom: 0, left: -20 }
          }
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {compact ? null : (
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
          )}
          {compact ? null : (
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#8c8c8c" }}
              tickLine={false}
              axisLine={false}
              minTickGap={24}
            />
          )}
          {compact ? null : (
            <YAxis
              allowDecimals={false}
              width={36}
              tick={{ fontSize: 10, fill: "#8c8c8c" }}
              tickLine={false}
              axisLine={false}
            />
          )}
          <Tooltip
            cursor={{ stroke: "rgba(0,0,0,0.15)" }}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid rgba(0,0,0,.1)" }}
            formatter={(value) => [String(value), valueLabel]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
