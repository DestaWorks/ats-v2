import { hasCapability } from "@destaworks/domain/constants";
import { getVerifiedUser } from "@destaworks/auth/guards";
import { reportFilterOptionsService } from "@destaworks/application/reports/filter-options.service";
import { pipelineReportsService } from "@destaworks/application/reports/pipeline-reports.service";
import { ErrorState } from "@destaworks/ui/error-state";
import { ReportsView } from "./reports-view";

/**
 * Reports (Wave 5.2, legacy `vw="reports"`) — leadership-gated (`viewReports`). Legacy had a real
 * nav/content gate mismatch here (nav showed the link to all leadership, but the view body only
 * rendered for the literal `admin` role — a Director/Manager/Owner got a blank page); this page
 * gates consistently on `viewReports`, matching the nav.
 */
export default async function ReportsPage() {
  const user = await getVerifiedUser();

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

  // Executive is the default/first-visible tab — server-fetch it with the default (unfiltered)
  // filters so it renders immediately instead of flashing a loading state, matching the
  // seed-then-refetch-on-interaction pattern used across the app. The other 9 tabs still
  // fetch client-side on first select.
  const [options, initialExecutive] = await Promise.all([
    reportFilterOptionsService.load(),
    pipelineReportsService.executiveSummary({}),
  ]);

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Reports</h1>
        <p className="mt-1 text-sm text-gray">
          Executive, pipeline, client, team, source, and compliance reports — server-computed,
          filterable, and exportable.
        </p>
      </header>
      <ReportsView options={options} initialExecutive={initialExecutive} />
    </div>
  );
}
