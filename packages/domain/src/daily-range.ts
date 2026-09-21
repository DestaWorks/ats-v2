import { DATE_KEY_RE, daysAfter, daysBefore, mondayOf } from "./daily";

/**
 * The periods the activity page can be read over.
 *
 * `day` is the only one that accepts INPUT — you log a day's numbers, never a quarter's. The wider
 * ranges are read-only summaries, which is why the page shows a different surface for each rather
 * than the same form at five scales.
 */
export const DATE_RANGES = ["day", "week", "month", "quarter", "year"] as const;
export type DateRange = (typeof DATE_RANGES)[number];

export function isDateRange(value: string): value is DateRange {
  return (DATE_RANGES as readonly string[]).includes(value);
}

/** Only `day` takes a log entry; everything wider is a report over days already logged. */
export function acceptsLogEntry(range: DateRange): boolean {
  return range === "day";
}

function parts(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split("-").map(Number);
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function keyOf(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Days in a month, Gregorian. February is the only case that needs the leap rule. */
function daysInMonth(y: number, m: number): number {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

/**
 * The inclusive `[from, to]` date keys one range covers, anchored on a date the user is looking at.
 *
 * Anchored rather than always "the last N days": a week means Monday-to-Sunday, and a quarter means
 * the calendar quarter. "Last 7 days" and "this week" answer different questions, and a page that
 * says Week must mean the second one or the totals will not reconcile with anyone's own reckoning.
 */
export function rangeWindow(range: DateRange, anchor: string): { from: string; to: string } {
  if (!DATE_KEY_RE.test(anchor)) throw new Error(`Not a date key: ${anchor}`);
  const { y, m } = parts(anchor);

  switch (range) {
    case "day":
      return { from: anchor, to: anchor };
    case "week": {
      const monday = mondayOf(anchor);
      return { from: monday, to: daysAfter(monday, 6) };
    }
    case "month":
      return { from: keyOf(y, m, 1), to: keyOf(y, m, daysInMonth(y, m)) };
    case "quarter": {
      const firstMonth = Math.floor((m - 1) / 3) * 3 + 1;
      const lastMonth = firstMonth + 2;
      return { from: keyOf(y, firstMonth, 1), to: keyOf(y, lastMonth, daysInMonth(y, lastMonth)) };
    }
    case "year":
      return { from: keyOf(y, 1, 1), to: keyOf(y, 12, 31) };
  }
}

/** Every date key in the window, inclusive. Bounded by the caller's range — a year is 365 keys. */
export function datesInWindow(from: string, to: string): string[] {
  const out: string[] = [];
  let cursor = from;
  // Guarded by a hard ceiling rather than trusting the inputs: a reversed or malformed pair would
  // otherwise spin here rather than failing, and this runs on a request path.
  for (let i = 0; i < 400 && cursor <= to; i += 1) {
    out.push(cursor);
    cursor = daysAfter(cursor, 1);
  }
  return out;
}

/** The same-length window immediately before this one, for a period-over-period comparison. */
export function previousWindow(from: string, to: string): { from: string; to: string } {
  const span = datesInWindow(from, to).length;
  return { from: daysBefore(from, span), to: daysBefore(from, 1) };
}
