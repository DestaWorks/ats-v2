import Link from "next/link";
import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { BoltIcon, FlagIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { getVerifiedUser } from "@/server/auth/guards";
import { candidateService } from "@/server/services/candidate.service";
import { dailyService } from "@/server/services/daily.service";
import { dateKeyForOffset } from "@/lib/daily";
import type { CandidateCardDTO } from "@/lib/validation/pipeline";
import { EmptyState } from "@/components/ui/empty-state";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { STATUS_BG } from "../pipeline/lib/status-style";
import { StatCard } from "./stat-card";
import { DailyStrip } from "./daily-strip";
import { SinceYouClosed } from "./since-you-closed";

// recharts is heavy — load it only once the distribution card actually renders (perf audit
// 2026-08-05), matching the `next/dynamic` pattern used for Candidate/Client Detail tabs.
const PipelineDistributionChart = dynamic(() =>
  import("./pipeline-distribution-chart").then((m) => m.PipelineDistributionChart),
);

/**
 * Overview (RSC, legacy-parity). Reads a lightweight summary (`candidateService.dashboardStats`)
 * that gets its per-stage counts from a Prisma `groupBy` and its "needs attention" list from a
 * small targeted query — it never loads the whole candidate table. Renders the legacy greeting
 * header, the single STACKED Pipeline-Distribution bar (proportional segment per non-empty
 * stage + dot legend), headline stats, the attention list, and a prominent link into the board.
 */
export default async function DashboardPage() {
  const user = await getVerifiedUser();

  // Daily strip's "today" is the USER-LOCAL date (`app-tz` cookie, shared with `/daily-log` and
  // `/weekly-brief` — see those pages' comments) — seed it server-side when the cookie is
  // present so it renders immediately instead of a blank gap while it fetches on mount.
  const cookieStore = await cookies();
  const rawTz = cookieStore.get("app-tz")?.value;
  const parsedTz = rawTz !== undefined ? Number(rawTz) : NaN;
  const initialTz =
    Number.isInteger(parsedTz) && parsedTz >= -840 && parsedTz <= 840 ? parsedTz : undefined;

  const [stats, initialDailyOverview] = await Promise.all([
    candidateService.dashboardStats(user),
    initialTz !== undefined
      ? dailyService.overview(user, dateKeyForOffset(initialTz), initialTz)
      : Promise.resolve(undefined),
  ]);
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
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-3xl font-bold text-charcoal">
          Good {timeOfDay}, {firstName}.
        </h1>
        <p className="mt-1 text-sm text-gray">
          {stats.active} candidate{stats.active === 1 ? "" : "s"} in pipeline · {today}
        </p>
      </header>

      {/* Daily accountability loop (Wave 3.1): targets/pace + End of Shift, then the recap. */}
      <DailyStrip initial={initialDailyOverview} initialTz={initialTz} />
      <SinceYouClosed userId={user.id} />

      {/* Main (stats + distribution) + a sidebar (needs attention) — fills the width on wide
          screens instead of one narrow centered column with dead space on both sides. */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <section className="grid grid-cols-3 gap-3">
            <StatCard label="Total" value={stats.total} icon={UserGroupIcon} />
            <StatCard label="Active" value={stats.active} tone="teal" icon={BoltIcon} />
            <StatCard label="Terminal" value={stats.terminal} tone="orange" icon={FlagIcon} />
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
                <div
                  role="img"
                  aria-label={`Pipeline distribution: ${filled
                    .map((c) => `${c.label} ${c.count}`)
                    .join(", ")}`}
                >
                  <PipelineDistributionChart columns={filled} total={distributionTotal} />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {filled.map((col) => (
                    <span
                      key={col.status}
                      className="flex items-center gap-1.5 text-xs text-charcoal"
                    >
                      <span
                        aria-hidden
                        className={cn("h-2 w-2 rounded-sm", STATUS_BG[col.status])}
                      />
                      {col.label} <span className="font-bold">{col.count}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card as="section" className="p-5 lg:col-span-1">
          <h2 className="mb-3 text-sm font-bold tracking-wide text-navy uppercase">
            Needs attention
          </h2>
          {attention.length === 0 ? (
            <p className="text-sm text-gray">Nothing overdue or stuck — the pipeline is healthy.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-black/5">
              {attention.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/candidates/${c.id}`}
                    className="flex flex-col gap-1 rounded-lg px-2 py-2.5 transition hover:bg-black/[0.03]"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={cn("h-2 w-2 rounded-full", STATUS_BG[c.status])}
                      />
                      <span className="text-sm font-semibold text-navy hover:underline">
                        {c.name}
                      </span>
                    </span>
                    <span className="flex items-center justify-between gap-3 pl-4">
                      <span className="text-xs text-gray">{c.clientName ?? "Unassigned"}</span>
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          c.isOverdue ? "text-red" : "text-orange",
                        )}
                      >
                        {c.isOverdue ? "overdue" : "stuck"} · {c.daysInStage}d
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
