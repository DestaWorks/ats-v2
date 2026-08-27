import { hasCapability } from "@destaworks/domain/constants";
import { dateKeyForOffset } from "@destaworks/domain/daily";
import { getVerifiedUser } from "@destaworks/auth/guards";
import { viewerTzOffset } from "@destaworks/integrations/http/viewer-tz";
import { dailyService } from "@destaworks/application/daily.service";
import { DailyLogView } from "./daily-log-view";

/**
 * Daily Log & KPI Tracker (Wave 3.1, legacy `vw="dailylog"` + the Journal). "Today" is the
 * USER-LOCAL date, which an RSC render can't know on a cold visit — so the composite still
 * loads client-side via `GET /api/daily/log?date&tz` on first-ever load. From the SECOND visit
 * on (perf audit 2026-08-05), `daily-log-view.tsx` mirrors its resolved tz offset into an
 * `app-tz` cookie (shared with `/weekly-brief`, same underlying "browser's local day" signal);
 * when present, this page server-fetches the same composite directly (bypassing the internal
 * HTTP round-trip) and seeds it, so the client only re-fetches if the browser's live tz offset
 * doesn't match what was seeded (DST shift, travel) — see `daily-log-view.tsx`'s skip-first-fetch
 * guard. Full-width layout (no `max-w` cap) — matches legacy (its dailylog view
 * has no width cap either, its 5-column KPI/form grids fill the whole container) and every other
 * page in this app (Sourcing/Roles/Candidates/Dashboard all use `px-8 py-6`, no cap).
 *
 * `canViewTeam` (design pass 2026-08-04) is computed here, server-side, from the real session
 * role — `DailyLogView` uses it to decide whether the "Team" tab (the former standalone
 * `/daily-brief` page) exists at all, so a non-leadership viewer never sees it, not even as an
 * empty/hidden tab.
 */
export default async function DailyLogPage() {
  const user = await getVerifiedUser();
  const canViewTeam = hasCapability(user.role, "viewReports");

  const initialTz = await viewerTzOffset();

  const initial =
    initialTz !== undefined
      ? await dailyService.logView(user, dateKeyForOffset(initialTz), initialTz)
      : undefined;

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Daily Log</h1>
        <p className="mt-1 text-sm text-gray">
          Self-report today&apos;s numbers, track your ramp, and keep your journal.
        </p>
      </header>
      <DailyLogView
        canViewTeam={canViewTeam}
        {...(initial !== undefined && { initial })}
        {...(initialTz !== undefined && { initialTz })}
      />
    </div>
  );
}
