"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OUTREACH_CHANNELS, type OutreachChannel } from "@/lib/constants";
import type { OutreachAttemptDTO } from "@/lib/validation/lead";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime } from "./lib/notes-format";
import { messageForFailure, postOutreach } from "./lib/detail-fetch";

/** Display labels for the shared channel enum (wire values stay lowercase). */
const CHANNEL_LABEL: Record<OutreachChannel, string> = {
  email: "Email",
  phone: "Phone",
  linkedin: "LinkedIn",
  other: "Other",
};

/**
 * Outreach surface (candidate_log_outreach parity). The history merges attempts logged directly on
 * the candidate with the promoted-from lead's sourcing trail (shared `outreach_attempts` table), so
 * the full chase is visible in one place. Notes are ESCAPED React text — never
 * `dangerouslySetInnerHTML` (D-3).
 */
export function OutreachTab({
  candidateId,
  attempts,
  onLogged,
  announce,
}: {
  candidateId: string;
  attempts: OutreachAttemptDTO[];
  onLogged: (attempt: OutreachAttemptDTO) => void;
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [channel, setChannel] = useState<OutreachChannel>(OUTREACH_CHANNELS[0]);
  const [note, setNote] = useState("");

  function submit() {
    startTransition(async () => {
      const result = await postOutreach(candidateId, { channel, note: note.trim() || null });
      if (result.ok) {
        onLogged(result.data);
        setNote("");
        toast.success("Outreach logged");
        announce("Outreach logged");
        router.refresh();
      } else {
        toast.error(messageForFailure(result.failure));
        announce(`Couldn't log outreach: ${messageForFailure(result.failure)}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Channel" htmlFor="outreach-channel" className="w-40">
            <Select
              id="outreach-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as OutreachChannel)}
            >
              {OUTREACH_CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          {/* "(optional)" lives in the label, not a hint line below — a hint would break the
              row's bottom alignment (channel · note · button all end on the control line). */}
          <Field label="Note (optional)" htmlFor="outreach-note" className="min-w-56 flex-1">
            <Textarea
              id="outreach-note"
              rows={1}
              className="resize-y"
              placeholder="Left a voicemail, sent intro email…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <Button type="submit" size="sm" loading={pending}>
            Log outreach
          </Button>
        </div>
      </form>

      {attempts.length === 0 ? (
        <EmptyState
          title="No outreach yet"
          description="Log the first attempt above — the promoted lead's history also shows here."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {attempts.map((attempt) => (
            <li key={attempt.id} className="rounded-xl border border-black/5 bg-white p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="navy" size="sm">
                    {CHANNEL_LABEL[attempt.channel]}
                  </Badge>
                  <span className="text-sm font-semibold text-charcoal">
                    {attempt.actorName ?? "—"}
                  </span>
                </div>
                <time dateTime={attempt.at} className="text-xs text-gray">
                  {formatRelativeTime(attempt.at)}
                </time>
              </div>
              {attempt.note ? (
                /* D-3: escaped React text — NEVER dangerouslySetInnerHTML. */
                <p className="text-sm whitespace-pre-wrap text-charcoal">{attempt.note}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
