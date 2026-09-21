import { z } from "zod";
import { DATE_KEY_RE } from "@destaworks/domain/daily";
import { DATE_RANGES } from "@destaworks/domain/daily-range";

/** `GET /daily/summary` — one period of activity, for the range-filtered activity page. */
export const dailySummaryQuerySchema = z
  .object({
    range: z.enum(DATE_RANGES),
    /** The date the period is anchored on — "the week containing this day". */
    date: z.string().regex(DATE_KEY_RE, "Expected YYYY-MM-DD"),
    /** `mine` is the caller's own log; `team` needs the target-setting capability. */
    scope: z.enum(["mine", "team"]).default("mine"),
  })
  .strict();
export type DailySummaryQuery = z.infer<typeof dailySummaryQuerySchema>;

/** The five self-reported numbers, summed over a period. */
export interface DailyTotalsDTO {
  sourced: number;
  outreach: number;
  responses: number;
  screenings: number;
  submitted: number;
  /** How many days in the period actually carry a log — the denominator for any average. */
  daysLogged: number;
}

/** One day's contribution, for the series the page charts. */
export interface DailyPointDTO {
  date: string;
  sourced: number;
  outreach: number;
  responses: number;
  screenings: number;
  submitted: number;
}

/**
 * A period of activity.
 *
 * `previous` is the same-length window immediately before, so every figure can be shown against
 * something rather than floating alone. `daysInPeriod` is the calendar length, which with
 * `totals.daysLogged` is what makes "3 of 7 days logged" sayable — a total of 40 means something
 * different over three days than over seven.
 */
export interface DailySummaryDTO {
  range: string;
  scope: string;
  from: string;
  to: string;
  daysInPeriod: number;
  totals: DailyTotalsDTO;
  previous: DailyTotalsDTO;
  days: DailyPointDTO[];
  /** Summed targets for the period, when targets were set. `null` when none were. */
  targets: DailyTotalsDTO | null;
}
