"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { PROSPECT_STATUSES, prospectStatusTone } from "@/lib/constants";
import type { ProspectListItemDTO } from "@/lib/validation/prospect";
import { messageForFailure } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Td } from "@/components/ui/table";
import { deleteProspect, patchProspect, postRestoreProspect } from "./lib/prospect-fetch";
import { ProspectDetailButton } from "./prospect-detail-modal";

/**
 * One `/client-discovery` inventory row — mirrors `sourcing/lead-row.tsx`'s shape, simplified to
 * this domain's actual actions (no outreach/promote/snooze): inline status select, "View"
 * (opens the contacts/enrich modal), and delete/restore.
 */
export function ProspectRow({
  prospect,
  selected,
  onToggleSelect,
  onUpdated,
  onRemoved,
}: {
  prospect: ProspectListItemDTO;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdated: (prospect: ProspectListItemDTO) => void;
  onRemoved: (id: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const isClient = prospect.status === "Client";

  function changeStatus(status: string) {
    startTransition(async () => {
      const res = await patchProspect(prospect.id, { status: status as never });
      if (res.ok) {
        onUpdated(res.data.prospect);
        toast.success("Status updated");
      } else {
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  function remove() {
    if (!window.confirm(`Soft-delete ${prospect.practiceName}?`)) return;
    startTransition(async () => {
      const res = await deleteProspect(prospect.id);
      if (res.ok) {
        onRemoved(prospect.id);
        toast.success("Prospect deleted");
      } else {
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  function restore() {
    startTransition(async () => {
      const res = await postRestoreProspect(prospect.id);
      if (res.ok) {
        onUpdated(res.data.prospect);
        toast.success(`${prospect.practiceName} restored`);
      } else {
        toast.error(messageForFailure(res.failure));
      }
    });
  }

  return (
    <tr
      className={cn(
        "transition",
        prospect.deletedAt ? "bg-red/5 opacity-70" : "hover:bg-black/[0.03]",
      )}
    >
      <Td>
        <input
          type="checkbox"
          aria-label={`Select ${prospect.practiceName}`}
          className="accent-navy"
          checked={selected}
          onChange={onToggleSelect}
        />
      </Td>
      <Td>
        <span className="font-semibold text-navy">{prospect.practiceName}</span>
        {prospect.deletedAt ? (
          <Badge tone="danger" size="sm" className="ml-1.5 align-middle">
            Deleted
          </Badge>
        ) : null}
      </Td>
      <Td>{prospect.taxonomy ?? <span className="text-gray">—</span>}</Td>
      <Td>{[prospect.city, prospect.state].filter(Boolean).join(", ") || "—"}</Td>
      <Td>
        {prospect.deletedAt || isClient ? (
          <Badge tone={prospectStatusTone(prospect.status)}>{prospect.status}</Badge>
        ) : (
          <Select
            aria-label="Status"
            value={prospect.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value)}
            className="!w-40"
          >
            {PROSPECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        )}
      </Td>
      <Td className="text-gray">{prospect.ownerName ?? "—"}</Td>
      <Td>
        <div className="flex items-center gap-1.5 whitespace-nowrap">
          {prospect.deletedAt ? (
            <Button type="button" size="xs" variant="secondary" loading={pending} onClick={restore}>
              Restore
            </Button>
          ) : (
            <>
              <ProspectDetailButton
                prospectId={prospect.id}
                practiceName={prospect.practiceName}
                onUpdated={onUpdated}
              />
              <Button type="button" size="xs" variant="danger" loading={pending} onClick={remove}>
                Delete
              </Button>
            </>
          )}
        </div>
      </Td>
    </tr>
  );
}
