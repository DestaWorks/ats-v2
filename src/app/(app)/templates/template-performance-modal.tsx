"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getJson, messageForFailure } from "@/lib/api/client";
import type {
  TemplatePerformanceDTO,
  TemplatePerformanceRowDTO,
} from "@/lib/validation/template-performance";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/spinner";
import { Table, Td } from "@/components/ui/table";

/** Rate color tiers (legacy `index.html:8851`): ≥20% green, ≥10% orange, >0% gray, 0% red. */
function rateColor(rate: number | null): string {
  if (rate === null) return "text-gray";
  if (rate >= 20) return "text-green";
  if (rate >= 10) return "text-orange";
  if (rate > 0) return "text-charcoal";
  return "text-red";
}

/** Trigger button — the modal only mounts (and fetches) once opened. */
export function TemplatePerformanceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        📊 Perf
      </Button>
      {open ? <TemplatePerformanceModal onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function TemplatePerformanceModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<TemplatePerformanceRowDTO[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getJson<TemplatePerformanceDTO>("/api/templates/performance");
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        toast.error(messageForFailure(res.failure));
        return;
      }
      setRows(res.data.rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Modal open onClose={onClose} title="Template Performance">
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="No template sends yet"
          description="Usage and response-rate data will appear here once templates start being sent."
        />
      ) : (
        <>
          <Table
            caption="Template usage and response rate"
            columns={["Template", "Sends", "Responses", "Rate", "Avg days", "Top channel"]}
          >
            {rows.map((r) => (
              <tr key={r.templateId} className="hover:bg-black/[0.02]">
                <Td className="font-medium">{r.templateName}</Td>
                <Td>
                  {r.sends}{" "}
                  <span className="text-[11px] text-gray">
                    ({r.candidateSends} cand · {r.leadSends} lead)
                  </span>
                </Td>
                <Td>{r.responses}</Td>
                <Td className={`font-bold ${rateColor(r.rate)}`}>
                  {r.rate === null ? "—" : `${r.rate}%`}
                </Td>
                <Td>{r.avgDays === null ? "—" : `${r.avgDays}d`}</Td>
                <Td className="capitalize">{r.topChannel ?? "—"}</Td>
              </tr>
            ))}
          </Table>
          <p className="mt-2 text-[11px] text-gray">
            Response rate is computed from sourced-lead sends only (candidates have no
            &ldquo;responded&rdquo; signal to track). ≥20% green · ≥10% orange · &gt;0% gray · 0%
            red.
          </p>
        </>
      )}
    </Modal>
  );
}
