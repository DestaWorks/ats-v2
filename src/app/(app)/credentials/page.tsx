import Link from "next/link";
import { redirect } from "next/navigation";
import { hasCapability } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { credentialsIntelligenceService } from "@/server/services/credentials-intelligence.service";
import { ErrorState } from "@/components/ui/error-state";
import { StatCard } from "../dashboard/stat-card";
import { PrintButton } from "./print-button";
import { CoverageMatrix } from "./coverage-matrix";
import { GapAnalysisGrid } from "./gap-analysis-grid";
import { NlcTracker } from "./nlc-tracker";

/**
 * Credentials Intelligence (RSC, Wave 3.6) — a read-only leadership dashboard: 6 stat cards, a
 * credential×state coverage matrix, client×credential gap analysis, and an NLC compact-license
 * tracker. Gated on `viewCredentials` (leadership capability, matches the License tab's own
 * PII-visibility gate) — unlike `/license-verify` (open to every operator), this page is
 * explicitly framed as leadership-only per the plan doc. Deliberately does NOT re-render the
 * Verification Queue / Expiry Timeline tables — those already live at `/license-verify`; this
 * page summarizes (via the stat cards) and links out instead of duplicating that UI.
 */
export default async function CredentialsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!hasCapability(user.role, "viewCredentials")) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6 sm:p-8">
        <ErrorState
          title="You don't have access"
          message="Credentials Intelligence is limited to leadership roles. Ask an Owner, Director, Manager, or Admin for access."
        />
      </div>
    );
  }

  const { stats, matrix, gapAnalysis, nlcHolders } =
    await credentialsIntelligenceService.overview();

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Credentials Intelligence</h1>
          <p className="text-sm text-gray">
            Verification status, license expiry, and coverage gaps across the pipeline.
          </p>
        </div>
        <div className="no-print">
          <PrintButton />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total Pipeline" value={stats.total} />
        <StatCard label="Active License" value={stats.active} tone="green" />
        <StatCard label="Unverified" value={stats.unverified} tone="orange" />
        <StatCard label="Expired" value={stats.expired} tone="red" />
        <StatCard label="Expiring <90d" value={stats.expiringSoon} tone="orange" />
        <StatCard label="NLC Compact" value={stats.nlcCompact} tone="teal" />
      </section>

      {stats.unverified > 0 || stats.expiringSoon > 0 ? (
        <section className="flex flex-col gap-1 rounded-xl border border-black/5 bg-white p-4 text-sm">
          {stats.unverified > 0 ? (
            <p className="text-charcoal">
              <span className="font-semibold text-orange">{stats.unverified}</span> candidate
              {stats.unverified === 1 ? "" : "s"} need verification —{" "}
              <Link href="/license-verify" className="font-semibold text-navy hover:underline">
                View full queue →
              </Link>
            </p>
          ) : null}
          {stats.expiringSoon > 0 ? (
            <p className="text-charcoal">
              <span className="font-semibold text-orange">{stats.expiringSoon}</span> license
              {stats.expiringSoon === 1 ? "" : "s"} expiring within 90 days —{" "}
              <Link href="/license-verify" className="font-semibold text-navy hover:underline">
                View full queue →
              </Link>
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-charcoal">Coverage Matrix</h2>
        <CoverageMatrix matrix={matrix} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-charcoal">Gap Analysis</h2>
        <GapAnalysisGrid rows={gapAnalysis} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-charcoal">NLC Compact Tracker</h2>
        <NlcTracker holders={nlcHolders} />
      </section>
    </div>
  );
}
