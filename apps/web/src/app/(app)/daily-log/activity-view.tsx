"use client";

import { useState, type ReactNode } from "react";
import { dateKey } from "@destaworks/domain/daily";
import { acceptsLogEntry, DATE_RANGES, type DateRange } from "@destaworks/domain/daily-range";
import type { DailyLogViewDTO } from "@destaworks/contracts/validation/daily";
import { SegmentedControl } from "@destaworks/ui/segmented-control";
import { DailyStrip } from "../dashboard/daily-strip";
import { DailyLogView } from "./daily-log-view";
import { RangeSummary } from "./range-summary";
import { WeekPanel } from "./week-panel";

const RANGE_OPTIONS = DATE_RANGES.map((range) => ({
  value: range,
  label: range.charAt(0).toUpperCase() + range.slice(1),
}));

const SCOPE_OPTIONS = [
  { value: "mine" as const, label: "My activity" },
  { value: "team" as const, label: "Team" },
];

/**
 * The activity page's single frame: one range control over both the log and the reports.
 *
 * `day` is the only range that renders the LOG FORM, because a self-report is a statement about
 * one day — there is no such thing as logging a quarter's numbers. Every wider range renders the
 * same aggregate instead, so switching range changes the question being asked rather than just
 * rescaling the same widget.
 */
export function ActivityView({
  canViewTeam,
  weeklyBrief,
  initial,
  initialTz,
}: {
  canViewTeam: boolean;
  /** The Weekly Brief, folded in at `week` for anyone entitled to it. */
  weeklyBrief?: ReactNode;
  initial?: DailyLogViewDTO;
  initialTz?: number;
}) {
  const [range, setRange] = useState<DateRange>("day");
  const [scope, setScope] = useState<"mine" | "team">("mine");
  const today = dateKey();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold tracking-wider text-gray uppercase">Range</span>
          <SegmentedControl
            value={range}
            onChange={setRange}
            options={RANGE_OPTIONS}
            ariaLabel="Date range"
          />
        </div>
        {canViewTeam && (
          <SegmentedControl
            value={scope}
            onChange={setScope}
            options={SCOPE_OPTIONS}
            ariaLabel="Whose activity"
          />
        )}
      </div>

      {acceptsLogEntry(range) ? (
        <>
          {/* Today's targets, pace and End of Shift — the daily loop, at the only range where a
              single day's targets mean anything. `showRoster` adds the leadership target list. */}
          <DailyStrip showRoster={canViewTeam} {...(initialTz !== undefined && { initialTz })} />
          <DailyLogView
            canViewTeam={canViewTeam}
            scope={scope}
            {...(initial !== undefined && { initial })}
            {...(initialTz !== undefined && { initialTz })}
          />
        </>
      ) : (
        <>
          <RangeSummary range={range} date={today} scope={scope} />
          {/* Pace and weekly goals belong to the week — they used to render on the Day view,
              where a heading reading "this week" contradicted the range you had selected. */}
          {range === "week" && scope === "mine" ? <WeekPanel /> : null}
          {range === "week" && weeklyBrief !== undefined ? weeklyBrief : null}
        </>
      )}
    </div>
  );
}
