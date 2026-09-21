import Link from "next/link";
import type { TopCandidateDTO } from "@destaworks/contracts/validation/pipeline";
import { Card } from "@destaworks/ui/card";
import { cn } from "@destaworks/domain/utils/cn";

function scoreTone(pct: number): string {
  if (pct >= 70) return "bg-green/10 text-green";
  return pct >= 40 ? "bg-orange/10 text-orange" : "bg-red/10 text-red";
}

export function TopCandidates({ rows }: { rows: TopCandidateDTO[] }) {
  if (rows.length === 0) return null;

  return (
    <Card as="section" className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold tracking-wide text-navy uppercase">Top candidates</h2>
        <Link
          href="/candidates?sort=fit"
          className="rounded-md bg-black/5 px-2.5 py-1 text-xs font-semibold text-gray transition hover:bg-black/10"
        >
          View all
        </Link>
      </div>
      <ul className="flex flex-col divide-y divide-black/5">
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/candidates/${row.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-black/[0.03]"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                  scoreTone(row.matchPct),
                )}
              >
                {row.matchPct}%
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-charcoal">
                  {row.name}
                </span>
                <span className="block truncate text-xs text-gray">
                  {[row.credential, row.licenseState, row.clientName].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-navy/10 px-2 py-0.5 text-[10px] font-semibold text-navy">
                {row.statusLabel}
              </span>
              {row.isOverdue && (
                <span className="shrink-0 text-xs font-bold text-orange">{row.daysInStage}d</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
