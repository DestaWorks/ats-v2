import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { ErrorState } from "@/components/ui/error-state";
import { WeeklyBriefView } from "./weekly-brief-view";

/**
 * Weekly Brief (Wave 5.1, legacy `vw="weekly"`). Thin auth shell — client loads the composite.
 * LEADERSHIP-gated (`viewReports`, matching Daily Brief's 2026-08-04 gate — this page was an
 * oversight the same pass missed: a team-wide AI report was reachable by any signed-in role).
 */
export default async function WeeklyBriefPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

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

  return (
    <div className="flex flex-col gap-6 px-8 py-6 print:px-0 print:py-0">
      <header className="print:hidden">
        <h1 className="text-2xl font-bold text-navy">Weekly Brief</h1>
        <p className="mt-1 text-sm text-gray">
          KPI deltas, per-client and per-associate rollups, accountability, and patterns.
        </p>
      </header>
      <WeeklyBriefView />
    </div>
  );
}
