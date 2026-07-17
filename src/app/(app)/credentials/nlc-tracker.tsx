import type { NlcHolderDTO } from "@/lib/validation/credentials";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * NLC compact-license tracker. Simplified from legacy's full 37-chip-per-holder cloud
 * (`legacy/index.html:3087-3107`) to a compact count badge — a 10-holder × 37-chip grid is
 * visual noise with little leadership value; the count already conveys "broad multi-state reach."
 */
export function NlcTracker({ holders }: { holders: NlcHolderDTO[] }) {
  if (holders.length === 0) {
    return (
      <EmptyState
        title="No NLC compact-license holders yet"
        description="Candidates licensed in a Nurse Licensure Compact state (NP/APRN/PMHNP/PMHNP-BC) will appear here."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {holders.map((holder) => (
        <Card key={holder.id} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <Link
                href={`/candidates/${holder.id}`}
                className="text-sm font-semibold text-navy hover:underline"
              >
                {holder.name}
              </Link>
              <p className="text-xs text-gray">
                {holder.credential ?? "—"} · home: {holder.licenseState ?? "—"}
              </p>
            </div>
            <Badge tone="navy">NLC · +{holder.additionalStatesCount}</Badge>
          </div>
        </Card>
      ))}
    </div>
  );
}
