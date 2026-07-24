import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { reportFilterOptionsService } from "@/server/services/reports/filter-options.service";
import { ErrorState } from "@/components/ui/error-state";
import { ReportsView } from "./reports-view";

/**
 * Reports (Wave 5.2, legacy `vw="reports"`) — leadership-gated (`viewReports`). Legacy had a real
 * nav/content gate mismatch here (nav showed the link to all leadership, but the view body only
 * rendered for the literal `admin` role — a Director/Manager/Owner got a blank page); this page
 * gates consistently on `viewReports`, matching the nav.
 */
export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!hasCapability(user.role, "viewReports")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Reports is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for access."
        />
      </div>
    );
  }

  const options = await reportFilterOptionsService.load();

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Reports</h1>
        <p className="mt-1 text-sm text-gray">
          Executive, pipeline, client, team, source, and compliance reports — server-computed,
          filterable, and exportable.
        </p>
      </header>
      <ReportsView options={options} />
    </div>
  );
}
