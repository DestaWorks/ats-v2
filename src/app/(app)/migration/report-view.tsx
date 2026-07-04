import type { BadgeTone } from "@/components/ui/badge";
import type { ImportAction, ImportReport } from "@/lib/validation/migration";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td } from "@/components/ui/table";
import { cn } from "@/lib/utils/cn";

/**
 * Presentational render of an `ImportReport` — shared by the preview (what commit WOULD do) and the
 * commit result (what it DID). Pure/stateless: summary count badges, the email-duplicate groups,
 * any warnings, and the full row table with a per-row action badge + reason chips. Flagged/errored
 * rows are made visually prominent (a tinted row + prominent action badge). No hooks → no client
 * directive; it renders inside the wizard's client boundary.
 */

/** Tone per action for the row badge (flagged = amber, errored = danger; writes lean success/navy). */
const ACTION_TONE: Record<ImportAction, BadgeTone> = {
  add: "success",
  update: "navy",
  softDelete: "neutral",
  skip: "neutral",
  error: "danger",
};

const ACTION_LABEL: Record<ImportAction, string> = {
  add: "add",
  update: "update",
  softDelete: "soft-delete",
  skip: "skip",
  error: "error",
};

/** One summary stat with a count badge + text label (never colour-only — a11y). */
function Stat({ label, value, tone }: { label: string; value: number; tone: BadgeTone }) {
  return (
    <Card className="flex flex-col gap-1 p-3">
      <Badge tone={tone} className="self-start text-sm">
        {value}
      </Badge>
      <span className="text-xs font-medium text-gray">{label}</span>
    </Card>
  );
}

export function ReportView({ report }: { report: ImportReport }) {
  const { counts } = report;
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Import summary" className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <Stat label="Added" value={counts.added} tone="success" />
        <Stat label="Updated" value={counts.updated} tone="navy" />
        <Stat label="Soft-deleted" value={counts.softDeleted} tone="neutral" />
        <Stat label="Skipped" value={counts.skipped} tone="neutral" />
        <Stat label="Flagged" value={counts.flagged} tone="amber" />
        <Stat label="Errored" value={counts.errored} tone="danger" />
      </section>

      {report.warnings && report.warnings.length > 0 ? (
        <div
          role="alert"
          className="rounded-xl border border-orange/30 bg-orange/5 px-4 py-3 text-sm text-charcoal"
        >
          <p className="font-semibold text-orange">Warnings</p>
          <ul className="mt-1 list-disc pl-5">
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.emailDuplicateGroups.length > 0 ? (
        <Card as="section" className="p-4" aria-label="Email duplicate groups">
          <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
            Email duplicates · {report.emailDuplicateGroups.length}
          </h3>
          <p className="mt-1 text-xs text-gray">
            Different legacy rows share an email. All are imported (matched by legacy id) and tagged
            Needs Review — nothing is merged. The kept primary is the most recently updated.
          </p>
          <ul className="mt-2 flex flex-col divide-y divide-black/5">
            {report.emailDuplicateGroups.map((g) => (
              <li key={g.email} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-medium text-charcoal">{g.email}</span>
                <span className="text-xs text-gray">
                  {g.legacyIds.join(", ")} — primary{" "}
                  <span className="font-semibold text-charcoal">{g.keptLegacyId}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <section aria-label="Per-row report" className="flex flex-col gap-2">
        <h3 className="text-sm font-bold tracking-wide text-navy uppercase">
          Rows · {report.rows.length}
        </h3>
        {report.rows.length === 0 ? (
          <EmptyState title="No rows" description="The parsed export produced no candidate rows." />
        ) : (
          <Table
            caption="Per-row import report"
            columns={["Legacy ID", "Name", "Action", "Reasons"]}
          >
            {report.rows.map((r) => {
              const prominent = r.action === "error";
              return (
                <tr
                  key={r.legacyId}
                  className={cn("hover:bg-black/[0.02]", r.action === "error" && "bg-red/5")}
                >
                  <Td className="font-mono text-xs">{r.legacyId}</Td>
                  <Td className="font-medium">{r.name}</Td>
                  <Td>
                    <Badge tone={ACTION_TONE[r.action]} size="sm">
                      {ACTION_LABEL[r.action]}
                    </Badge>
                  </Td>
                  <Td>
                    {r.reasons.length === 0 ? (
                      <span className="text-xs text-gray">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {r.reasons.map((reason) => (
                          <Badge
                            key={reason}
                            size="sm"
                            pill={false}
                            tone={prominent ? ACTION_TONE[r.action] : "neutral"}
                          >
                            {reason}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}
