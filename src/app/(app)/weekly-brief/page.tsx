import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { WeeklyBriefView } from "./weekly-brief-view";

/** Weekly Brief (Wave 5.1, legacy `vw="weekly"`). Thin auth shell — client loads the composite. */
export default async function WeeklyBriefPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

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
