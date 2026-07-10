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
import {
  deleteLead,
  postOutreach,
  postPromote,
  postRespond,
  postRestore,
  postSnooze,
} from "./lib/lead-fetch";
import { OutreachHistoryModal } from "./outreach-history-modal";
import { leadActionState } from "./lib/leads-query";

type OpenModal = "outreach" | "promote" | "delete" | "snooze" | "history" | null;

/** True while the lead's snooze date is in the FUTURE (date-aware — an expired snooze is awake). */
export function isSnoozed(snoozedUntil: string | null, now: number = Date.now()): boolean {
  if (!snoozedUntil) return false;
  const t = new Date(snoozedUntil).getTime();
  return !Number.isNaN(t) && t > now;
}

/** Default snooze horizon (legacy `openSnooze`: +7 days), as an `<input type="date">` value. */
function defaultSnoozeDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

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
  const [snoozeDate, setSnoozeDate] = useState(defaultSnoozeDate);

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

  function snooze(until: string | null) {
    startTransition(async () => {
      const result = await postSnooze(lead.id, until);
      if (result.ok) {
        toast.success(until ? `Snoozed until ${until}` : "Lead woken");
        onUpdated(result.data.lead);
        close();
      } else {
        toast.error(messageForFailure(result.failure));
        close();
      }
    });
  }

  function restore() {
    startTransition(async () => {
      const result = await postRestore(lead.id);
      if (result.ok) {
        toast.success(`${lead.name} restored`);
        onUpdated(result.data.lead);
      } else {
        toast.error(messageForFailure(result.failure));
      }
    });
  }

  // A soft-deleted row offers exactly one action: bring it back (mirrors the legacy Restore).
  if (lead.deletedAt) {
    return (
      <Button
        type="button"
        size="xs"
        variant="secondary"
        loading={pending}
        onClick={restore}
        aria-label={`Restore ${lead.name}`}
      >
        Restore
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="primary"
        disabled={!canLogOutreach}
        onClick={() => setOpen("outreach")}
      >
        Log
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
        variant="purple"
        disabled={!canPromote}
        onClick={() => setOpen("promote")}
      >
        Promote
      </Button>
      <Button type="button" size="xs" variant="secondary" onClick={() => setOpen("history")}>
        History
      </Button>
      {isSnoozed(lead.snoozedUntil) ? (
        <Button
          type="button"
          size="xs"
          variant="secondary"
          loading={pending}
          onClick={() => snooze(null)}
        >
          Wake
        </Button>
      ) : lead.status !== "Promoted" ? (
        <Button
          type="button"
          size="xs"
          variant="secondary"
          onClick={() => {
            setSnoozeDate(defaultSnoozeDate());
            setOpen("snooze");
          }}
          aria-label={`Snooze ${lead.name}`}
        >
          Snooze
        </Button>
      ) : null}
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

      {/* Snooze modal — free until-date, default +7 days (legacy parity). */}
      <Modal open={open === "snooze"} onClose={close} title={`Snooze — ${lead.name}`}>
        <div className="flex flex-col gap-4">
          <Field
            label="Snooze until"
            htmlFor={`snooze-${lead.id}`}
            hint="Excludes this lead from stuck-lead alerts until the date below — useful when waiting for a callback or an intentional pause."
          >
            <input
              id={`snooze-${lead.id}`}
              type="date"
              value={snoozeDate}
              onChange={(e) => setSnoozeDate(e.target.value)}
              className="rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              loading={pending}
              disabled={!snoozeDate}
              onClick={() => snooze(snoozeDate)}
            >
              Snooze
            </Button>
            <Button type="button" variant="secondary" disabled={pending} onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Outreach history — edit/delete logged attempts. */}
      <OutreachHistoryModal
        leadId={lead.id}
        leadName={lead.name}
        open={open === "history"}
        onClose={close}
        onUpdated={onUpdated}
      />

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
