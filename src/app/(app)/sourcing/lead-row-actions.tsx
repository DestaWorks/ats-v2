"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OUTREACH_CHANNELS } from "@/lib/constants";
import type { LeadListItemDTO } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { deleteLead, postOutreach, postPromote, postRespond } from "./lib/lead-fetch";
import { leadActionState } from "./lib/leads-query";

type OpenModal = "outreach" | "promote" | "delete" | null;

/**
 * Per-row action cluster for the `/sourcing` inventory. Renders labeled buttons (not a color-only
 * affordance) whose enabled state is driven by the PURE `leadActionState` (a Promoted lead is
 * terminal → every action disabled, matching what the service would reject). Log-outreach and
 * promote open a `Modal` (focus-trap/ESC via the primitive); Hot/Cold respond in-place. Outreach +
 * respond return the fresh lead detail, applied via `onUpdated` (snappy, authoritative — no
 * refetch); promote navigates to the new candidate; delete drops the row via `onRemoved`. A 409
 * CONFLICT (someone else promoted the lead) surfaces as a toast and drops the stale row.
 */
export function LeadRowActions({
  lead,
  onUpdated,
  onRemoved,
}: {
  lead: LeadListItemDTO;
  onUpdated: (lead: LeadListItemDTO) => void;
  onRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<OpenModal>(null);
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<(typeof OUTREACH_CHANNELS)[number]>(OUTREACH_CHANNELS[0]);
  const [note, setNote] = useState("");

  const { canLogOutreach, canRespond, canPromote } = leadActionState(lead.status);

  function close() {
    setOpen(null);
    setNote("");
    setChannel(OUTREACH_CHANNELS[0]);
  }

  function logOutreach() {
    startTransition(async () => {
      const result = await postOutreach(lead.id, { channel, note: note.trim() || null });
      if (result.ok) {
        toast.success("Outreach logged");
        onUpdated(result.data.lead);
        close();
      } else {
        toast.error(messageForFailure(result.failure));
        if (result.failure.code === "CONFLICT") {
          onRemoved(lead.id);
          close();
        }
      }
    });
  }

  function respond(kind: "hot" | "cold") {
    startTransition(async () => {
      const result = await postRespond(lead.id, kind);
      if (result.ok) {
        toast.success(kind === "hot" ? "Marked Responded — Hot" : "Marked Responded — Cold");
        onUpdated(result.data.lead);
      } else {
        toast.error(messageForFailure(result.failure));
        if (result.failure.code === "CONFLICT") onRemoved(lead.id);
      }
    });
  }

  function promote() {
    startTransition(async () => {
      const result = await postPromote(lead.id);
      if (result.ok) {
        toast.success(`${lead.name} promoted to a candidate`);
        router.push(`/candidates/${result.data.candidateId}`);
      } else {
        toast.error(messageForFailure(result.failure));
        // Already promoted by someone else → the local row is stale; drop it (matches outreach/respond).
        if (result.failure.code === "CONFLICT") onRemoved(lead.id);
        close();
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteLead(lead.id);
      if (result.ok) {
        toast.success("Lead deleted");
        onRemoved(lead.id);
        close();
      } else {
        toast.error(messageForFailure(result.failure));
        close();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={!canLogOutreach}
        onClick={() => setOpen("outreach")}
      >
        Log outreach
      </Button>
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={!canRespond || pending}
        onClick={() => respond("hot")}
      >
        Hot
      </Button>
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={!canRespond || pending}
        onClick={() => respond("cold")}
      >
        Cold
      </Button>
      <Button
        type="button"
        size="xs"
        variant="primary"
        disabled={!canPromote}
        onClick={() => setOpen("promote")}
      >
        Promote
      </Button>
      <Button
        type="button"
        size="xs"
        variant="danger"
        onClick={() => setOpen("delete")}
        aria-label={`Delete ${lead.name}`}
      >
        Delete
      </Button>

      {/* Log-outreach modal — channel + optional note. */}
      <Modal open={open === "outreach"} onClose={close} title={`Log outreach — ${lead.name}`}>
        <div className="flex flex-col gap-5">
          <Field label="Channel" htmlFor={`ch-${lead.id}`}>
            <Select
              id={`ch-${lead.id}`}
              value={channel}
              onChange={(e) => setChannel(e.target.value as (typeof OUTREACH_CHANNELS)[number])}
            >
              {OUTREACH_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor={`note-${lead.id}`} hint="Optional">
            <textarea
              id={`note-${lead.id}`}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none disabled:opacity-50"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="button" loading={pending} onClick={logOutreach}>
              Log outreach
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Promote confirm. */}
      <Modal open={open === "promote"} onClose={close} title="Promote lead">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-charcoal">
            Promote <span className="font-semibold">{lead.name}</span> to a candidate? This creates
            a pipeline candidate and closes the lead.
          </p>
          <div className="flex gap-2">
            <Button type="button" loading={pending} onClick={promote}>
              Promote to candidate
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm. */}
      <Modal open={open === "delete"} onClose={close} title="Delete lead">
        <div className="flex flex-col gap-5">
          <p className="text-sm text-charcoal">
            Delete <span className="font-semibold">{lead.name}</span>? The lead moves to Trash and
            can be restored.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="danger" loading={pending} onClick={remove}>
              Delete lead
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
