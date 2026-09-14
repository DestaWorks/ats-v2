import { tzOffsetSchema } from "@destaworks/contracts/validation/daily";
import type { Clock } from "@destaworks/domain/clock";
import { DATE_KEY_RE, dateKeyForOffset } from "@destaworks/domain/daily";
import { viewerTzOffset } from "@destaworks/integrations/http/viewer-tz";

/**
 * "Today", resolved in the VIEWER's timezone — never the host's.
 *
 * The API is a long-lived process running in UTC, so `dateKey()` there answers the SERVER's
 * calendar question and the two disagree for part of every day: at 22:30Z a viewer at UTC+3 is
 * already on tomorrow, and at 01:30 local that viewer would otherwise be served yesterday's log.
 * Phase 0.6 replaced the ambient `new Date()` with an injected `Clock` for exactly this; the
 * offset is the other half of it, and it can only come from the request.
 *
 * One resolver for both route areas that need it, because they source the offset differently and
 * must still agree on what the answer means: `/daily/*` sends it explicitly as `?tz=`, while
 * `/briefs/*` has only the `app-tz` cookie `useTzCookieSync` keeps current.
 */

/**
 * The viewer's `Date.getTimezoneOffset()` offset for this request: an explicit `?tz=` wins, then
 * the `app-tz` cookie, then UTC.
 *
 * An explicit value is parsed by the contract's own `tzOffsetSchema`, so a non-numeric or
 * out-of-range `tz` still raises the 422 the Next.js routes raise rather than being quietly
 * ignored. The final `0` is UTC and is inherited verbatim from those routes — the one case where
 * the host's day can stand in, and only when the request carries no timezone at all.
 *
 * Reading the cookie needs the request in scope, which `requestContextMiddleware` establishes for
 * the whole of a request's handling.
 */
export async function resolveViewerTz(explicit?: string | undefined): Promise<number> {
  if (explicit !== undefined) return tzOffsetSchema.parse(explicit);
  return (await viewerTzOffset()) ?? 0;
}

/** The requested day key if it is one, else the viewer's own "today" at `tz`. */
export function viewerDay(requested: string | undefined, tz: number, clock?: Clock): string {
  return requested !== undefined && DATE_KEY_RE.test(requested)
    ? requested
    : dateKeyForOffset(tz, clock);
}
