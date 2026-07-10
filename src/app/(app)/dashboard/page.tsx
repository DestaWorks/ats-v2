import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import type { CandidateCardDTO } from "@/lib/validation/pipeline";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { STATUS_BG } from "../pipeline/lib/status-style";
import { StatCard } from "./stat-card";

/**
 * Overview (RSC, legacy-parity). Reads a lightweight summary (`candidateService.dashboardStats`)
 * that gets its per-stage counts from a Prisma `groupBy` and its "needs attention" list from a
 * small targeted query — it never loads the whole candidate table. Renders the legacy greeting
 * header, the single STACKED Pipeline-Distribution bar (proportional segment per non-empty
 * stage + dot legend), headline stats, the attention list, and a prominent link into the board.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const stats = await candidateService.dashboardStats(user);
  const attention: CandidateCardDTO[] = stats.attention;

  // Legacy Overview greeting: time-of-day + first name + "N candidates in pipeline · date".
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const firstName = user.name.split(" ")[0] ?? user.name;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const filled = stats.columns.filter((c) => c.count > 0);
  const distributionTotal = filled.reduce((sum, c) => sum + c.count, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <header>
        <h1 className="text-3xl font-bold text-charcoal">
          Good {timeOfDay}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-gray">
          {stats.active} candidate{stats.active === 1 ? "" : "s"} in pipeline · {today}
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Terminal" value={stats.terminal} />
      </section>

      <Card as="section" className="p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-base font-bold text-charcoal">Pipeline Distribution</h2>
          {/* An anchor (next/link), not a <button> — kept inline; it mirrors the primary/sm Button look. */}
          <Link
            href="/pipeline"
            className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Open pipeline board →
          </Link>
        </div>
        <p className="mb-4 text-xs text-gray">
          Team pipeline · {distributionTotal} candidate{distributionTotal === 1 ? "" : "s"}
        </p>
        {distributionTotal === 0 ? (
          <EmptyState
            title="No candidates yet"
            description="Add candidates via the résumé flow to populate the pipeline."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {/* The stacked bar — one proportional segment per non-empty stage (legacy Overview). */}
            <div
              role="img"
              aria-label={`Pipeline distribution: ${filled
                .map((c) => `${c.label} ${c.count}`)
                .join(", ")}`}
              className="flex h-8 w-full gap-0.5 overflow-hidden rounded-md"
            >
              {filled.map((col) => (
                <div
                  key={col.status}
                  className={cn(
                    "flex min-w-6 items-center justify-center text-xs font-semibold text-white",
                    STATUS_BG[col.status],
                  )}
                  style={{ flexGrow: col.count }}
                >
                  {col.count / distributionTotal >= 0.08 ? col.count : null}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
              {filled.map((col) => (
                <span key={col.status} className="flex items-center gap-1.5 text-xs text-charcoal">
                  <span aria-hidden className={cn("h-2 w-2 rounded-sm", STATUS_BG[col.status])} />
                  {col.label} <span className="font-bold">{col.count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card as="section" className="p-5">
        <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">
          Needs attention
        </h2>
        {attention.length === 0 ? (
          <p className="text-sm text-gray">Nothing overdue or stuck — the pipeline is healthy.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/5">
            {attention.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex items-center gap-2">
                  <span aria-hidden className={cn("h-2 w-2 rounded-full", STATUS_BG[c.status])} />
                  <span className="text-sm font-medium text-charcoal">{c.name}</span>
                  <span className="text-xs text-gray">{c.clientName ?? "Unassigned"}</span>
                </span>
                <span
                  className={cn("text-xs font-semibold", c.isOverdue ? "text-red" : "text-orange")}
                >
                  {c.isOverdue ? "overdue" : "stuck"} · {c.daysInStage}d
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
