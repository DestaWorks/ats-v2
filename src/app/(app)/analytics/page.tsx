import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { reportFilterOptionsService } from "@/server/services/reports/filter-options.service";
import { ErrorState } from "@/components/ui/error-state";
import { AnalyticsView } from "./analytics-view";

/** Analytics (Wave 5.2, legacy `vw="kpi"`) — leadership-gated (`viewAnalytics`). */
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!hasCapability(user.role, "viewAnalytics")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Analytics is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for access."
        />
      </div>
    );
  }

  const options = await reportFilterOptionsService.load();

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Analytics</h1>
        <p className="mt-1 text-sm text-gray">
          By-status/client/source breakdowns, Time-to-Fill, Source-of-Hire, and Client Capacity.
        </p>
      </header>
      <AnalyticsView options={{ users: options.users }} />
    </div>
  );
}
