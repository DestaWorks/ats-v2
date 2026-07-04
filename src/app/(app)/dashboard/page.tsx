import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import type { CandidateCardDTO } from "@/lib/validation/pipeline";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { STATUS_BG } from "../pipeline/lib/status-style";
import { FunnelBar } from "./funnel-bar";
import { StatCard } from "./stat-card";

/**
 * Dashboard (RSC). Reads the funnel-grouped board directly (`candidateService.listBoard`) and
 * renders the pipeline funnel (bar per active stage), headline stats (active / overdue / stuck),
 * a "needs attention" list (overdue + stuck cards — the board DTO carries no `createdAt`, so this
 * is more useful than an arbitrary "recent"), and a prominent link into the board.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const board = await candidateService.listBoard({}, user);
  const maxCount = board.columns.reduce((m, c) => Math.max(m, c.count), 0);

  const attention: CandidateCardDTO[] = board.columns
    .flatMap((c) => c.candidates)
    .filter((c) => c.isOverdue || c.isStuck)
    .sort((a, b) => b.daysInStage - a.daysInStage)
    .slice(0, 8);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-bold text-navy">Dashboard</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={board.meta.total} />
        <StatCard label="Active" value={board.meta.active} />
        <StatCard label="Overdue" value={board.meta.overdue} tone="red" />
        <StatCard label="Stuck >7d" value={board.meta.stuck} tone="orange" />
      </section>

      <Card as="section" className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-wide text-navy uppercase">Pipeline funnel</h2>
          {/* An anchor (next/link), not a <button> — kept inline; it mirrors the primary/sm Button look. */}
          <Link
            href="/pipeline"
            className="rounded-md bg-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Open pipeline board →
          </Link>
        </div>
        {board.meta.active === 0 ? (
          <EmptyState
            title="No active candidates"
            description="Add candidates via the résumé flow to populate the pipeline."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {board.columns.map((col) => (
              <FunnelBar
                key={col.status}
                status={col.status}
                label={col.label}
                count={col.count}
                max={maxCount}
              />
            ))}
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
