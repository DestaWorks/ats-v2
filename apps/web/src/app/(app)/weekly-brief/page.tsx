import { hasCapability } from "@destaworks/domain/constants";
import { dateKeyForOffset, mondayOf } from "@destaworks/domain/daily";
import { getVerifiedUser } from "@destaworks/auth/guards";
import { viewerTzOffset } from "@destaworks/integrations/http/viewer-tz";
import { briefService } from "@destaworks/application/brief.service";
import { ErrorState } from "@destaworks/ui/error-state";
import { WeeklyBriefView } from "./weekly-brief-view";

/**
 * Weekly Brief (Wave 5.1, legacy `vw="weekly"`). LEADERSHIP-gated (`viewReports`, matching Daily
 * Brief's 2026-08-04 gate — this page was an oversight the same pass missed: a team-wide AI
 * report was reachable by any signed-in role). "This week" is the USER-LOCAL calendar week,
 * which an RSC render can't know on a cold visit — so the composite still loads client-side on
 * first-ever load. From the second visit on (perf audit 2026-08-05), this reads the `app-tz`
 * cookie (shared with `/daily-log` — same "browser's local day" signal) and, when present,
 * server-fetches the saved brief for that week directly, seeding `WeeklyBriefView` so it skips
 * its redundant first client fetch.
 */
export default async function WeeklyBriefPage() {
  const user = await getVerifiedUser();

  if (!hasCapability(user.role, "viewReports")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Weekly Brief is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for access."
        />
      </div>
    );
  }

  const initialTz = await viewerTzOffset();

  const initialWeekStart =
    initialTz !== undefined ? mondayOf(dateKeyForOffset(initialTz)) : undefined;
  const seed =
    initialTz !== undefined && initialWeekStart !== undefined
      ? {
          initial: await briefService.getWeekly(initialWeekStart, user),
          initialWeekStart,
          initialTz,
        }
      : {};

  return (
    <div className="flex flex-col gap-6 px-8 py-6 print:px-0 print:py-0">
      <header className="print:hidden">
        <h1 className="text-2xl font-bold text-navy">Weekly Brief</h1>
        <p className="mt-1 text-sm text-gray">
          KPI deltas, per-client and per-associate rollups, accountability, and patterns.
        </p>
      </header>
      <WeeklyBriefView {...seed} />
    </div>
  );
}
