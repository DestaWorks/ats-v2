"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { CandidateTrashItemDTO } from "@/lib/validation/candidate";
import { Table, Td } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "../candidates/[id]/lib/notes-format";
import { messageForFailure, restoreCandidate } from "./lib/trash-actions";
import { PurgeCandidateModal } from "./purge-candidate-modal";

/**
 * Trash view rows (client). Renders the soft-deleted candidates as a `Table` with per-row
 * **Restore** (open to all operators) and — only when `canPurge` — **Purge** (opens the
 * type-to-confirm `PurgeCandidateModal`). The server re-enforces `purgeCandidate` on the route, so
 * the `canPurge` gate here is a UI hint only. Both actions drop the row locally on success and
 * `router.refresh()` for cross-view coherence; outcomes announce via toast + an `aria-live` region.
 *
 * Rows are intentionally NOT linked to the candidate detail page: the detail RSC loads via `findById`
 * which excludes soft-deleted rows, so a link would 404. Restore first, then open the candidate.
 */
export function TrashList({
  items,
  canPurge,
}: {
  items: CandidateTrashItemDTO[];
  canPurge: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [restoring, startRestore] = useTransition();
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [purgeTarget, setPurgeTarget] = useState<CandidateTrashItemDTO | null>(null);

  function dropRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function restore(item: CandidateTrashItemDTO) {
    setRestoringId(item.id);
    startRestore(async () => {
      const result = await restoreCandidate(item.id);
      if (result.ok) {
        dropRow(item.id);
        toast.success(`Restored ${item.name}`);
        setAnnouncement(`Restored ${item.name}`);
        router.refresh();
      } else {
        const message = messageForFailure(result.failure);
        toast.error(message);
        setAnnouncement(`Restore failed: ${message}`);
      }
      setRestoringId(null);
    });
  }

  function onPurged(id: string, name: string) {
    dropRow(id);
    setPurgeTarget(null);
    setAnnouncement(`Purged ${name}`);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Trash is empty"
        description="Deleted candidates appear here and can be restored."
      />
    );
  }

  const columns = [
    "Name",
    "Credential",
    "Client",
    "Status",
    "Deleted",
    "By",
    <span key="actions" className="sr-only">
      Actions
    </span>,
  ];

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <Table caption="Soft-deleted candidates" columns={columns}>
        {rows.map((item) => (
          <tr key={item.id} className="hover:bg-black/[0.02]">
            <Td className="font-medium text-charcoal">{item.name}</Td>
            <Td>{item.credential ?? "—"}</Td>
            <Td>{item.clientName ?? <span className="text-gray italic">Unassigned</span>}</Td>
            <Td>
              <Badge tone="neutral">{item.statusLabel}</Badge>
            </Td>
            <Td>
              <time dateTime={item.deletedAt} title={new Date(item.deletedAt).toLocaleString()}>
                {formatRelativeTime(item.deletedAt)}
              </time>
            </Td>
            <Td>{item.deletedByName ?? "—"}</Td>
            <Td>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => restore(item)}
                  loading={restoring && restoringId === item.id}
                  disabled={restoring && restoringId === item.id}
                >
                  Restore
                </Button>
                {canPurge ? (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setPurgeTarget(item)}
                    disabled={restoring && restoringId === item.id}
                  >
                    Purge
                  </Button>
                ) : null}
              </div>
            </Td>
          </tr>
        ))}
      </Table>

      {purgeTarget ? (
        <PurgeCandidateModal
          open
          candidateId={purgeTarget.id}
          candidateName={purgeTarget.name}
          onClose={() => setPurgeTarget(null)}
          onPurged={onPurged}
        />
      ) : null}
    </>
  );
}
