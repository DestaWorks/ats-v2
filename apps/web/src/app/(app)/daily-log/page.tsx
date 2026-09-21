import { hasCapability, hasModule } from "@destaworks/domain/constants";
import { dateKeyForOffset } from "@destaworks/domain/daily";
import { requirePageUser } from "@/lib/page-user";
import { viewerTzOffset } from "@destaworks/integrations/http/viewer-tz";
import type { DailyLogViewDTO } from "@destaworks/contracts/validation/daily";
import { apiGet, query } from "@/lib/api/server";
import { ActivityView } from "./activity-view";
import { WeeklyBriefView } from "../weekly-brief/weekly-brief-view";
import { mondayOf } from "@destaworks/domain/daily";
import type { WeeklyBriefDTO } from "@destaworks/contracts/validation/briefs";

/**
 * Daily Log & KPI Tracker (Wave 3.1, legacy `vw="dailylog"` + the Journal). "Today" is the
 * USER-LOCAL date, which an RSC render can't know on a cold visit — so the composite still
 * loads client-side via `GET /api/daily/log?date&tz` on first-ever load. From the SECOND visit
 * on (perf audit 2026-08-05), `daily-log-view.tsx` mirrors its resolved tz offset into an
 * `app-tz` cookie (shared with `/weekly-brief`, same underlying "browser's local day" signal);
 * when present, this page server-fetches the same composite from the API and seeds it, so the
 * client only re-fetches if the browser's live tz offset doesn't match what was seeded (DST
 * shift, travel) — see `daily-log-view.tsx`'s skip-first-fetch
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
  const user = await requirePageUser();
  const canViewTeam = hasCapability(user, "viewReports");

  const initialTz = await viewerTzOffset();

  const initial =
    initialTz !== undefined
      ? await apiGet<DailyLogViewDTO>(
          `/daily/log${query({ date: dateKeyForOffset(initialTz), tz: initialTz })}`,
        )
      : undefined;

  // The Weekly Brief, folded into `week` rather than kept as its own nav item. Both gates are the
  // page's own — the AI module and reporting access — so an unentitled viewer simply gets no brief
  // rather than an upsell wedged inside the activity page.
  // Seeded only when the `app-tz` cookie is present; WITHOUT it the component still renders and
  // fetches on mount. Gating the whole block on the cookie hid the brief entirely on a session
  // that had not written one yet — which is every first visit.
  const briefSeed =
    initialTz === undefined
      ? {}
      : {
          initial: await apiGet<WeeklyBriefDTO | null>(
            `/briefs/weekly${query({ weekStart: mondayOf(dateKeyForOffset(initialTz)) })}`,
          ),
          initialWeekStart: mondayOf(dateKeyForOffset(initialTz)),
          initialTz,
        };

  const weeklyBrief =
    hasModule(user.modules, "ai") && canViewTeam ? <WeeklyBriefView {...briefSeed} /> : null;

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Performance</h1>
        <p className="mt-1 text-sm text-gray">
          Targets, activity and briefs — for you or the team, over any period.
        </p>
      </header>
      <ActivityView
        canViewTeam={canViewTeam}
        {...(weeklyBrief !== null && { weeklyBrief })}
        {...(initial !== undefined && { initial })}
        {...(initialTz !== undefined && { initialTz })}
      />
    </div>
  );
}
