import Link from "next/link";
import type { ClientCadenceDTO } from "@destaworks/contracts/validation/pipeline";
import { Card } from "@destaworks/ui/card";
import { cn } from "@destaworks/domain/utils/cn";

/**
 * Colour reads the gap against the client's OWN rhythm, not a fixed threshold: a client who
 * normally replies in a day is late at three, while one who replies fortnightly is not.
 */
function toneFor(row: ClientCadenceDTO): string {
  if (row.anomaly) return "text-red";
  if (row.daysSinceLast === null) return "text-gray";
  return row.daysSinceLast <= row.avgDays + 2 ? "text-green" : "text-orange";
}

export function ClientCadence({ rows }: { rows: ClientCadenceDTO[] }) {
  if (rows.length === 0) return null;

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-xs font-bold tracking-wider text-gray uppercase">Client cadence</h2>
        <p className="mt-0.5 text-xs text-gray">
          How fast each client usually replies, and how long they have been quiet
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((row) => (
          <Card key={row.clientId} className="px-3 py-2.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <Link
                href={`/crm/${row.clientId}`}
                className="truncate text-sm font-semibold text-charcoal hover:text-navy"
              >
                {row.clientName}
              </Link>
              {row.anomaly && (
                <span className="rounded bg-red/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-red">
                  ANOMALY
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray">
              <span>
                avg <strong className="text-charcoal">{row.avgDays}d</strong>
              </span>
              <span>
                current{" "}
                <strong className={cn(toneFor(row))}>
                  {row.daysSinceLast === null ? "—" : `${row.daysSinceLast}d`}
                </strong>
              </span>
              {row.pendingCount > 0 && <span>{row.pendingCount} pending</span>}
            </div>
            {row.waitingCandidate !== null && (
              <Link
                href={`/candidates/${row.waitingCandidate.id}`}
                className="mt-1 block text-xs text-red hover:underline"
              >
                ↳ {row.waitingCandidate.name} waiting
              </Link>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
}
