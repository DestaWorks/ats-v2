"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import type { NextActionDTO } from "@destaworks/contracts/validation/pipeline";
import type { OutreachMessageDTO } from "@destaworks/contracts/validation/outreach-draft";
import { cn } from "@destaworks/domain/utils/cn";
import { Button } from "@destaworks/ui/button";
import { getJson, postJson, messageForFailure } from "@/lib/api/client";

const DOT: Record<string, string> = { P1: "bg-red", P2: "bg-orange", P3: "bg-navy" };

export function ActionRow({ action }: { action: NextActionDTO }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<OutreachMessageDTO | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const isVerify = action.type === "VERIFY";

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (isVerify || message !== null || loading) return;

    setLoading(true);
    const result = await getJson<OutreachMessageDTO>(
      `/api/candidates/${action.candidateId}/outreach/message?type=${action.type}`,
    );
    setLoading(false);
    if (result.ok) setMessage(result.data);
    else toast.error(messageForFailure(result.failure));
  }

  /** Log the attempt. Shared by both send paths so outreach history has one shape. */
  async function logAttempt(): Promise<boolean> {
    if (message === null) return false;
    setSending(true);
    const result = await postJson(`/api/candidates/${action.candidateId}/outreach`, {
      channel: "email",
      note: message.subject,
      templateId: message.templateId,
    });
    setSending(false);
    if (!result.ok) {
      toast.error(messageForFailure(result.failure));
      return false;
    }
    setSent(true);
    return true;
  }

  /**
   * Hand the message to Gmail's compose window, pre-filled, and log the attempt.
   *
   * The same mechanism the Templates screen uses: the app never sends mail itself, so the send
   * happens from the recruiter's own mailbox — their address, their signature, their sent folder,
   * and replies land with them rather than in a system inbox nobody reads.
   */
  async function openInGmail() {
    if (message === null) return;
    const url = `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(
      message.to ?? "",
    )}&su=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    if (await logAttempt()) toast.success("Opened in Gmail and logged as outreach");
  }

  async function copyMessage() {
    if (message === null) return;
    await navigator.clipboard
      .writeText(`Subject: ${message.subject}\n\n${message.body}`)
      .catch(() => undefined);
    if (await logAttempt()) toast.success("Copied and logged as outreach");
  }

  return (
    <div className={cn(open && "border-l-2 border-navy bg-navy/[0.02]")}>
      {/* The whole row is the control: a one-word link was a small target for a list you work
          down, and the row already reads as a single item. */}
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]"
      >
        <span
          aria-hidden
          className={cn("h-2 w-2 shrink-0 rounded-full", DOT[action.priority] ?? "bg-gray")}
        />
        <span className="w-16 shrink-0 text-[10px] font-bold tracking-wider text-gray uppercase">
          {action.type}
        </span>
        <span className="w-40 shrink-0 truncate text-sm font-semibold text-charcoal">
          {action.candidateName}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-gray">{action.reason}</span>
        <span className="shrink-0 text-sm font-semibold text-navy">
          {sent ? "Sent ✓" : isVerify ? "Open →" : "Send →"}
        </span>
      </button>

      {open && (
        <div className="px-4 pt-1 pb-4">
          <p className="text-[10px] font-bold tracking-wider text-navy uppercase">
            Why this is here
          </p>
          <p className="mt-1 mb-3 text-sm text-charcoal">{action.reason}</p>

          {loading && <p className="text-sm text-gray">Preparing the message…</p>}

          {message !== null && (
            <div className="rounded-lg border border-black/5 bg-white p-4">
              <p className="text-[10px] font-bold tracking-wider text-gray uppercase">
                {message.templateName} · to {message.to ?? `[no ${message.audience} email on file]`}
              </p>
              <p className="mt-1 font-semibold text-charcoal">{message.subject}</p>
              <p className="mt-2 text-sm whitespace-pre-wrap text-charcoal">{message.body}</p>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {message !== null && (
              <>
                <Button size="sm" onClick={openInGmail} disabled={sending || sent}>
                  {sent ? "Sent ✓" : "Open in Gmail"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={copyMessage}
                  disabled={sending || sent}
                >
                  Copy
                </Button>
              </>
            )}
            <Link
              href={`/candidates/${action.candidateId}`}
              className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-semibold text-charcoal transition hover:bg-black/[0.03]"
            >
              Open candidate
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
