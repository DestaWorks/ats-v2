"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OUTREACH_CHANNELS, leadStatusTone, type OutreachChannel } from "@/lib/constants";
import type { LeadDetailDTO, LeadListItemDTO, OutreachAttemptDTO } from "@/lib/validation/lead";
import { messageForFailure } from "@/lib/api/client";
import { formatDate } from "@/lib/utils/format-date";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Td } from "@/components/ui/table";
import {
  deleteLead,
  deleteOutreachAttempt,
  getLeadDetail,
  patchOutreachAttempt,
  postOutreach,
  postPromote,
  postRespond,
  postRestore,
  postSnooze,
} from "./lib/lead-fetch";
import { leadActionState } from "./lib/leads-query";

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

/** Days since an ISO timestamp, for the legacy "Last touch" cell ("linkedin · 20d"). */
function daysAgo(iso: string): string {
  const d = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  return `${d}d`;
}

type OpenModal = "outreach" | "promote" | "delete" | "snooze" | null;

/**
 * One `/sourcing` inventory row (legacy parity): compact actions — Log (navy) · 💤 snooze ·
 * Promote (purple), and on a Promoted lead the `→ C…` link into the candidate (which the
 * intercepting route opens as the detail MODAL). Clicking the row expands an inline panel
 * (legacy expanded row): CONTACT + OUTREACH HISTORY (N) with per-attempt ✎ edit / × delete +
 * "+ Log Outreach", plus the responded/restore/delete controls.
 */
export function LeadRow({
  lead,
  selected,
  onToggleSelect,
  onUpdated,
  onRemoved,
}: {
  lead: LeadListItemDTO;
  selected: boolean;
  onToggleSelect: () => void;
  onUpdated: (lead: LeadListItemDTO) => void;
  onRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<LeadDetailDTO | null>(null);
  const [open, setOpen] = useState<OpenModal>(null);
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<OutreachChannel>(OUTREACH_CHANNELS[0]);
  const [note, setNote] = useState("");
  const [snoozeDate, setSnoozeDate] = useState(defaultSnoozeDate);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const { canLogOutreach, canRespond, canPromote } = leadActionState(lead.status);
  const snoozed = isSnoozed(lead.snoozedUntil);

  function close() {
    setOpen(null);
    setNote("");
    setChannel(OUTREACH_CHANNELS[0]);
  }

  function applyDetail(fresh: LeadDetailDTO) {
    setDetail(fresh);
    onUpdated(fresh);
  }

  function toggleExpand() {
    const next = !expanded;
    setExpanded(next);
    if (next && !detail) {
      void getLeadDetail(lead.id).then((res) => {
        if (res.ok) setDetail(res.data.lead);
        else toast.error(messageForFailure(res.failure));
      });
    }
  }

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
    });
  }

  function logOutreach() {
    run(async () => {
      const result = await postOutreach(lead.id, { channel, note: note.trim() || null });
      if (result.ok) {
        toast.success("Outreach logged");
        applyDetail(result.data.lead);
        close();
      } else {
        toast.error(messageForFailure(result.failure));
        if (result.failure.code === "CONFLICT") onRemoved(lead.id);
        close();
      }
    });
  }

  function respond(kind: "hot" | "cold") {
    run(async () => {
      const result = await postRespond(lead.id, kind);
      if (result.ok) {
        toast.success(kind === "hot" ? "Marked Responded — Hot" : "Marked Responded — Cold");
        applyDetail(result.data.lead);
      } else {
        toast.error(messageForFailure(result.failure));
        if (result.failure.code === "CONFLICT") onRemoved(lead.id);
      }
    });
  }

  function promote() {
    run(async () => {
      const result = await postPromote(lead.id);
      if (result.ok) {
        toast.success(`${lead.name} promoted to a candidate`);
        router.push(`/candidates/${result.data.candidateId}`);
      } else {
        toast.error(messageForFailure(result.failure));
        if (result.failure.code === "CONFLICT") onRemoved(lead.id);
        close();
      }
    });
  }

  function remove() {
    run(async () => {
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

  function restore() {
    run(async () => {
      const result = await postRestore(lead.id);
      if (result.ok) {
        toast.success(`${lead.name} restored`);
        applyDetail(result.data.lead);
      } else {
        toast.error(messageForFailure(result.failure));
      }
    });
  }

  function snooze(until: string | null) {
    run(async () => {
      const result = await postSnooze(lead.id, until);
      if (result.ok) {
        toast.success(until ? `Snoozed until ${until}` : "Lead woken");
        applyDetail(result.data.lead);
        close();
      } else {
        toast.error(messageForFailure(result.failure));
        close();
      }
    });
  }

  function saveAttempt(attemptId: string) {
    run(async () => {
      const res = await patchOutreachAttempt(lead.id, attemptId, {
        channel,
        note: note.trim() || null,
      });
      if (res.ok) {
        applyDetail(res.data.lead);
        setEditing(null);
        toast.success("Attempt updated");
      } else toast.error(messageForFailure(res.failure));
    });
  }

  function removeAttempt(attemptId: string) {
    run(async () => {
      const res = await deleteOutreachAttempt(lead.id, attemptId);
      setConfirming(null);
      if (res.ok) {
        applyDetail(res.data.lead);
        toast.success("Attempt deleted");
      } else toast.error(messageForFailure(res.failure));
    });
  }

  function startEdit(a: OutreachAttemptDTO) {
    setEditing(a.id);
    setChannel(a.channel);
    setNote(a.note ?? "");
    setConfirming(null);
  }

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <>
      <tr
        onClick={toggleExpand}
        aria-expanded={expanded}
        className={cn(
          "cursor-pointer transition",
          lead.deletedAt
            ? "bg-red/5 opacity-70"
            : snoozed
              ? "bg-orange/5 hover:bg-orange/10"
              : expanded
                ? "bg-navy/[0.03]"
                : "hover:bg-black/[0.03]",
        )}
      >
        <Td>
          <input
            type="checkbox"
            aria-label={`Select ${lead.name}`}
            className="accent-navy"
            checked={selected}
            onClick={stop}
            onChange={onToggleSelect}
          />
        </Td>
        <Td>
          <span className="font-semibold text-navy">{lead.name}</span>
          {lead.deletedAt ? (
            <Badge tone="danger" size="sm" className="ml-1.5 align-middle">
              Deleted
            </Badge>
          ) : null}
          {snoozed ? (
            <Badge tone="amber" size="sm" className="ml-1.5 align-middle">
              💤 until {lead.snoozedUntil!.slice(0, 10)}
            </Badge>
          ) : null}
        </Td>
        <Td>{lead.credential ?? <span className="text-gray">—</span>}</Td>
        <Td>{lead.state ?? <span className="text-gray">—</span>}</Td>
        <Td>{lead.targetClientName ?? <span className="text-gray">—</span>}</Td>
        <Td>
          <Badge tone={leadStatusTone(lead.status)}>{lead.status}</Badge>
        </Td>
        <Td>
          {lead.lastOutreachAt ? (
            <span className="text-gray">
              {lead.lastOutreachChannel ? `${lead.lastOutreachChannel} · ` : ""}
              {daysAgo(lead.lastOutreachAt)}
            </span>
          ) : (
            <span className="text-gray">—</span>
          )}
        </Td>
        <Td className="text-gray">{lead.ownerName ?? "—"}</Td>
        <Td onClick={stop}>
          {lead.deletedAt ? (
            <Button type="button" size="xs" variant="secondary" loading={pending} onClick={restore}>
              Restore
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <Button
                type="button"
                size="xs"
                variant="primary"
                disabled={!canLogOutreach}
                onClick={() => setOpen("outreach")}
              >
                Log
              </Button>
              {snoozed ? (
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
                <button
                  type="button"
                  title="Snooze alerts"
                  aria-label={`Snooze ${lead.name}`}
                  onClick={() => {
                    setSnoozeDate(defaultSnoozeDate());
                    setOpen("snooze");
                  }}
                  className="rounded-md bg-orange/15 px-2 py-1 text-xs transition hover:bg-orange/25"
                >
                  💤
                </button>
              ) : null}
              {lead.status === "Promoted" && lead.promotedCandidateId ? (
                <Link
                  href={`/candidates/${lead.promotedCandidateId}`}
                  className="text-xs font-semibold text-navy hover:underline"
                  title="Open the promoted candidate"
                >
                  → C{lead.promotedCandidateId.slice(-6)}
                </Link>
              ) : (
                <Button
                  type="button"
                  size="xs"
                  variant="purple"
                  disabled={!canPromote}
                  onClick={() => setOpen("promote")}
                >
                  Promote
                </Button>
              )}
            </div>
          )}
        </Td>
      </tr>

      {/* Expanded panel (legacy expanded row): CONTACT + OUTREACH HISTORY + row-level actions. */}
      {expanded ? (
        <tr className="bg-black/[0.015]">
          <Td />
          <Td className="pb-4" colSpan={8}>
            {!detail ? (
              <p className="py-2 text-sm text-gray">Loading…</p>
            ) : (
              <div className="grid gap-6 py-2 sm:grid-cols-2">
                <div>
                  <p className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
                    Contact
                  </p>
                  <dl className="mt-1.5 flex flex-col gap-1 text-sm">
                    {detail.email ? <dd className="text-charcoal">{detail.email}</dd> : null}
                    {detail.phone ? <dd className="text-charcoal">{detail.phone}</dd> : null}
                    {detail.linkedinUrl ? (
                      <dd>
                        <a
                          href={detail.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-navy hover:underline"
                        >
                          🔗 LinkedIn profile
                        </a>
                      </dd>
                    ) : null}
                    {!detail.email && !detail.phone && !detail.linkedinUrl ? (
                      <dd className="text-gray">No contact info.</dd>
                    ) : null}
                    {detail.notes ? (
                      <dd className="mt-1 text-xs whitespace-pre-wrap text-gray">{detail.notes}</dd>
                    ) : null}
                  </dl>
                  {!lead.deletedAt ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
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
                        variant="danger"
                        onClick={() => setOpen("delete")}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}
                </div>

                <div>
                  <p className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
                    Outreach history ({detail.attempts.length})
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {detail.attempts.map((a) => (
                      <li
                        key={a.id}
                        className="rounded-md border-l-[3px] border-navy/40 bg-white px-3 py-1.5 text-sm"
                      >
                        {editing === a.id ? (
                          <div className="flex flex-wrap items-center gap-1.5 py-1">
                            <Select
                              aria-label="Channel"
                              value={channel}
                              onChange={(e) => setChannel(e.target.value as OutreachChannel)}
                              className="!w-32"
                            >
                              {OUTREACH_CHANNELS.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </Select>
                            <input
                              aria-label="Note"
                              value={note}
                              onChange={(e) => setNote(e.target.value)}
                              className="min-w-40 flex-1 rounded-md border border-black/15 px-2 py-1 text-sm"
                            />
                            <Button
                              type="button"
                              size="xs"
                              loading={pending}
                              onClick={() => saveAttempt(a.id)}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="ghost"
                              onClick={() => setEditing(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0">
                              <span className="font-semibold text-charcoal">
                                {a.actorName ?? "—"}
                              </span>{" "}
                              <span className="text-gray">
                                via {a.channel} · {formatDate(a.at)}
                              </span>
                              {a.note ? (
                                <span className="block text-xs whitespace-pre-wrap text-gray">
                                  {a.note}
                                </span>
                              ) : null}
                            </span>
                            {confirming === a.id ? (
                              <span className="flex shrink-0 gap-1">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="danger"
                                  loading={pending}
                                  onClick={() => removeAttempt(a.id)}
                                >
                                  Confirm
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="ghost"
                                  onClick={() => setConfirming(null)}
                                >
                                  Keep
                                </Button>
                              </span>
                            ) : (
                              <span className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  aria-label="Edit attempt"
                                  title="Edit"
                                  onClick={() => startEdit(a)}
                                  className="rounded px-1 text-gray hover:bg-black/5 hover:text-charcoal"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  aria-label="Delete attempt"
                                  title="Delete"
                                  onClick={() => setConfirming(a.id)}
                                  className="rounded px-1 text-gray hover:bg-black/5 hover:text-red"
                                >
                                  ×
                                </button>
                              </span>
                            )}
                          </div>
                        )}
                      </li>
                    ))}
                    {detail.attempts.length === 0 ? (
                      <li className="text-sm text-gray">No outreach logged yet.</li>
                    ) : null}
                  </ul>
                  {!lead.deletedAt && canLogOutreach ? (
                    <Button
                      type="button"
                      size="xs"
                      className="mt-2"
                      onClick={() => setOpen("outreach")}
                    >
                      + Log Outreach
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </Td>
        </tr>
      ) : null}

      {/* Log-outreach modal — channel + optional note. */}
      <Modal open={open === "outreach"} onClose={close} title={`Log outreach — ${lead.name}`}>
        <div className="flex flex-col gap-5">
          <Field label="Channel" htmlFor={`ch-${lead.id}`}>
            <Select
              id={`ch-${lead.id}`}
              value={channel}
              onChange={(e) => setChannel(e.target.value as OutreachChannel)}
            >
              {OUTREACH_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note (optional)" htmlFor={`note-${lead.id}`}>
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
            hint="Excludes this lead from stuck-lead alerts until the date below."
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
            Soft-delete <span className="font-semibold">{lead.name}</span>? Recoverable via
            &quot;Show deleted&quot; → Restore.
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
    </>
  );
}
