import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { screeningService } from "@/server/services/screening.service";
import { ScreeningView } from "./screening-view";

/**
 * Screening (RSC, Wave 3.3) — a dedicated page (not a candidate-detail tab, matching legacy's own
 * layout: a candidate picker + the scorecard). Guards with `getCurrentUser()` (open to every
 * operator — Screener/Associate have no capabilities, so a gate would lock out the role literally
 * named "Screener"), SSR-renders the initial picker list.
 */
export default async function ScreeningPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const candidates = await screeningService.listEligibleCandidates(undefined);

  return (
    <div className="flex flex-col gap-5 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">Screening</h1>
        <p className="text-sm text-gray">
          Objective, metrics-based scoring — auto-calculated from verifiable criteria, not opinions.
        </p>
      </header>

      <ScreeningView initialCandidates={candidates} />
    </div>
  );
}
