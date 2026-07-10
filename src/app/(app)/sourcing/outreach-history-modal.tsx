"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OUTREACH_CHANNELS, type OutreachChannel } from "@/lib/constants";
import type { LeadDetailDTO, OutreachAttemptDTO } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { deleteOutreachAttempt, getLeadDetail, patchOutreachAttempt } from "./lib/lead-fetch";

/**
 * Outreach history for one lead (legacy expanded-row parity): every logged attempt with inline
 * ✎ edit (channel + note — the status selector is deliberately ABSENT on edit, legacy parity)
 * and × delete (confirmed; denorm re-syncs server-side, status never regresses). Legacy had no
 * role gate on either — any operator, every change audited server-side.
 */
export function OutreachHistoryModal({
  leadId,
  leadName,
  open,
  onClose,
  onUpdated,
}: {
  leadId: string;
  leadName: string;
  open: boolean;
  onClose: () => void;
  onUpdated: (lead: LeadDetailDTO) => void;
}) {
  const [attempts, setAttempts] = useState<OutreachAttemptDTO[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [channel, setChannel] = useState<OutreachChannel>(OUTREACH_CHANNELS[0]);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAttempts(null);
    void getLeadDetail(leadId).then((res) => {
      if (res.ok) setAttempts(res.data.lead.attempts);
      else toast.error(messageForFailure(res.failure));
    });
  }, [open, leadId]);

  function startEdit(attempt: OutreachAttemptDTO) {
    setEditing(attempt.id);
    setChannel(attempt.channel);
    setNote(attempt.note ?? "");
    setConfirming(null);
  }

  async function saveEdit(attemptId: string) {
    setPending(true);
    const res = await patchOutreachAttempt(leadId, attemptId, {
      channel,
      note: note.trim() || null,
    });
    setPending(false);
    if (res.ok) {
      setAttempts(res.data.lead.attempts);
      setEditing(null);
      onUpdated(res.data.lead);
      toast.success("Attempt updated");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  async function remove(attemptId: string) {
    setPending(true);
    const res = await deleteOutreachAttempt(leadId, attemptId);
    setPending(false);
    setConfirming(null);
    if (res.ok) {
      setAttempts(res.data.lead.attempts);
      onUpdated(res.data.lead);
      toast.success("Attempt deleted");
    } else {
      toast.error(messageForFailure(res.failure));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Outreach history — ${leadName}`}>
      {attempts === null ? (
        <p className="text-sm text-gray">Loading…</p>
      ) : attempts.length === 0 ? (
        <p className="text-sm text-gray">No outreach logged yet.</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
          {attempts.map((a) => (
            <li key={a.id} className="rounded-lg border border-black/10 p-3">
              {editing === a.id ? (
                <div className="flex flex-col gap-2">
                  <Select
                    aria-label="Channel"
                    value={channel}
                    onChange={(e) => setChannel(e.target.value as OutreachChannel)}
                  >
                    {OUTREACH_CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                  <textarea
                    aria-label="Note"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="xs"
                      loading={pending}
                      onClick={() => void saveEdit(a.id)}
                    >
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="secondary"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge tone="navy" size="sm">
                        {a.channel}
                      </Badge>
                      <span className="text-xs text-gray">
                        {a.actorName ?? "—"} · {formatDate(a.at)}
                      </span>
                    </div>
                    {a.note ? (
                      <p className="mt-1 text-sm whitespace-pre-wrap text-charcoal">{a.note}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {confirming === a.id ? (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant="danger"
                          loading={pending}
                          onClick={() => void remove(a.id)}
                        >
                          Confirm delete
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => setConfirming(null)}
                        >
                          Keep
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          size="xs"
                          variant="secondary"
                          onClick={() => startEdit(a)}
                          aria-label="Edit attempt"
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="xs"
                          variant="danger"
                          onClick={() => setConfirming(a.id)}
                          aria-label="Delete attempt"
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
