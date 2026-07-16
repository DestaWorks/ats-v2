import Link from "next/link";
import { redirect } from "next/navigation";
import { stateBoardLink } from "@/lib/constants";
import { getCurrentUser } from "@/server/auth/guards";
import { licenseVerifyService } from "@/server/services/license-verify.service";
import { Table, Td } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { expiryDaysColor } from "../pipeline/lib/status-style";

/**
 * License Verify (RSC, Wave 3.4) — a read-only Verification Queue + Expiry Timeline, ported from
 * legacy's Credentials Intelligence module (`legacy/index.html:3001-3037`). Legacy's queue has no
 * inline verify form — clicking a candidate opens the detail modal, where the real verify form
 * lives; that's already the `/candidates/:id` License tab. This page only launches into it.
 */
export default async function LicenseVerifyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const { queue, timeline, queueTruncated } = await licenseVerifyService.dashboard();

  return (
    <div className="flex flex-col gap-6 px-8 py-6">
      <header>
        <h1 className="text-2xl font-bold text-navy">License Verify</h1>
        <p className="text-sm text-gray">
          Candidates needing verification, and active licenses sorted by days until expiry. License
          status drives the pipeline gates — Initial Screening needs a verified license and
          Submitted to Client needs an Active one.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-charcoal">
          Verification Queue
          {queue.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-gray">
              {queue.length} candidate{queue.length === 1 ? "" : "s"} need verification
            </span>
          ) : null}
        </h2>
        {queue.length === 0 ? (
          <EmptyState
            title="No candidates need verification right now"
            description="Candidates with an unverified license will appear here."
          />
        ) : (
          <>
            <Table
              caption="Candidates needing license verification"
              columns={["Candidate", "Credential", "State", "Client", "Status", "Verify"]}
            >
              {queue.map((c) => {
                const board = stateBoardLink(c.licenseState);
                return (
                  <tr key={c.id} className="hover:bg-black/[0.02]">
                    <Td className="font-medium text-charcoal">
                      <Link href={`/candidates/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </Td>
                    <Td>{c.credential ?? "—"}</Td>
                    <Td>{c.licenseState ?? "—"}</Td>
                    <Td>{c.clientName ?? <span className="text-gray italic">Unassigned</span>}</Td>
                    <Td>
                      <Badge tone="amber">{c.licenseStatus}</Badge>
                    </Td>
                    <Td>
                      {board ? (
                        <div>
                          <a
                            href={board.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={
                              board.mapped
                                ? "font-semibold text-navy hover:underline"
                                : "text-gray hover:underline"
                            }
                          >
                            {board.mapped
                              ? `Check ${c.licenseState} board →`
                              : "Search license lookup →"}
                          </a>
                          {!board.mapped ? (
                            <p className="text-[11px] text-gray">
                              No saved portal for {c.licenseState}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-gray">No link</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </Table>
            {queueTruncated ? (
              <p className="text-xs text-gray">
                Showing the {queue.length} longest-waiting candidates — more exist.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-charcoal">License Expiry Timeline</h2>
        {timeline.length === 0 ? (
          <EmptyState
            title="No active licenses have an expiry date on file"
            description="Active-status candidates with a known expiry will appear here, soonest first."
          />
        ) : (
          <div className="flex flex-col gap-2 rounded-xl border border-black/5 bg-white p-4">
            {timeline.map((c) => {
              const pct = Math.min(Math.max((c.daysLeft / 365) * 100, 2), 100);
              const color = expiryDaysColor(c.daysLeft);
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <Link
                    href={`/candidates/${c.id}`}
                    className="min-w-[140px] truncate text-sm font-medium text-charcoal hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="min-w-[90px] text-xs text-gray">
                    {c.credential ?? "—"} · {c.licenseState ?? "—"}
                  </span>
                  <div className="h-3.5 flex-1 overflow-hidden rounded bg-black/5">
                    <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span
                    className={`min-w-[70px] text-right text-xs font-bold ${color.replace("bg-", "text-")}`}
                  >
                    {c.daysLeft <= 0 ? "EXPIRED" : `${c.daysLeft}d left`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
