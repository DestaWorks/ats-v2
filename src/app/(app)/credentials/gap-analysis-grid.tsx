import type { GapAnalysisRowDTO } from "@/lib/validation/credentials";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function GapAnalysisGrid({ rows }: { rows: GapAnalysisRowDTO[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No client credential requirements on file"
        description="Gap analysis populates once clients have required credentials set in their rules."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => (
        <Card key={`${row.clientId}::${row.credential}`} className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-charcoal">{row.clientName}</p>
              <p className="text-xs text-gray">{row.credential}</p>
            </div>
            {row.gap ? (
              <Badge tone="danger">GAP</Badge>
            ) : row.placed > 0 ? (
              <Badge tone="success">{row.placed} placed</Badge>
            ) : null}
          </div>
          {row.gap ? (
            <p className="mt-2 text-xs text-red italic">No candidates in pipeline</p>
          ) : (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-charcoal">
              <div className="flex justify-between gap-2">
                <dt className="text-gray">In pipeline</dt>
                <dd className="font-semibold">{row.inPipeline}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray">Verified</dt>
                <dd className="font-semibold">{row.verified}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray">Screening</dt>
                <dd className="font-semibold">{row.screening}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-gray">Submitted</dt>
                <dd className="font-semibold">{row.submitted}</dd>
              </div>
            </dl>
          )}
        </Card>
      ))}
    </div>
  );
}
