import Link from "next/link";
import type { NextActionsDTO } from "@destaworks/contracts/validation/pipeline";
import { Card } from "@destaworks/ui/card";
import { ActionRow } from "./action-row";

export function NextActions({ data }: { data: NextActionsDTO }) {
  if (data.actions.length === 0) {
    return (
      <section>
        <h2 className="mb-1 text-xs font-bold tracking-wider text-gray uppercase">
          What to do next
        </h2>
        <Card className="px-4 py-6 text-center">
          <p className="text-sm text-gray">
            Nothing needs chasing — no overdue stages and no licences awaiting verification.
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-xs font-bold tracking-wider text-gray uppercase">What to do next</h2>
      <p className="mt-0.5 mb-3 flex flex-wrap items-center gap-x-2 text-sm text-charcoal">
        <span className="font-semibold">
          {data.total} action{data.total === 1 ? "" : "s"}
        </span>
        {data.overdue > 0 && (
          <>
            <span aria-hidden className="text-gray">
              ·
            </span>
            <span className="font-semibold text-red">{data.overdue} P1 overdue</span>
          </>
        )}
        {data.verifications > 0 && (
          <>
            <span aria-hidden className="text-gray">
              ·
            </span>
            <span className="font-semibold text-orange">
              {data.verifications} verification{data.verifications === 1 ? "" : "s"}
            </span>
          </>
        )}
      </p>
      <Card className="divide-y divide-black/5 p-0">
        {data.actions.map((action) => (
          <ActionRow key={`${action.type}-${action.candidateId}`} action={action} />
        ))}
      </Card>
      {data.total > data.actions.length && (
        <p className="mt-2 text-xs text-gray">
          Showing {data.actions.length} of {data.total}.{" "}
          <Link href="/pipeline" className="font-semibold text-navy hover:underline">
            Open the pipeline board
          </Link>{" "}
          to work the rest.
        </p>
      )}
    </section>
  );
}
