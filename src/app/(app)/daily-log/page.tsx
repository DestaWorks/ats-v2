import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { DailyLogView } from "./daily-log-view";

/**
 * Daily Log & KPI Tracker (Wave 3.1, legacy `vw="dailylog"` + the Journal). The page is a thin
 * auth shell — "today" is the USER-LOCAL date, so the composite loads client-side via
 * `GET /api/daily/log?date&tz`.
 */
export default async function DailyLogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
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
