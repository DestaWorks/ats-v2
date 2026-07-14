import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { DailyLogView } from "./daily-log-view";

/**
 * Daily Log & KPI Tracker (Wave 3.1, legacy `vw="dailylog"` + the Journal). The page is a thin
 * auth shell — "today" is the USER-LOCAL date, so the composite loads client-side via
 * `GET /api/daily/log?date&tz`. Full-width layout (no `max-w` cap) — matches legacy (its dailylog
 * view has no width cap either, its 5-column KPI/form grids fill the whole container) and every
 * other page in this app (Sourcing/Roles/Candidates/Dashboard all use `px-8 py-6`, no cap).
 */
export default async function DailyLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Daily Log</h1>
        <p className="mt-1 text-sm text-gray">
          Self-report today&apos;s numbers, track your ramp, and keep your journal.
        </p>
      </header>
      <DailyLogView />
    </div>
  );
}
