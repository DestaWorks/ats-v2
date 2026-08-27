"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  isTerminalStatus,
  statusLabel,
  type CandidateStatus,
  type LicenseStatus,
  type Track,
} from "@/lib/constants";
import type { CandidateProfileDTO } from "@/lib/validation/candidate";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { systemClock } from "@/lib/clock";
import { buildStageMoverOptions, type StageMoverOption } from "./lib/stage-mover-options";
import { messageForFailure, postMove, type MovedFields } from "./lib/detail-fetch";

/** One connected-rail row (PIPELINE section). The connecting line itself is NOT drawn here — a
 *  single continuous line element (rendered once by the caller, behind every row) spans from the
 *  first dot's center to the last dot's center. Stitching a top/bottom half-segment per row looks
 *  right in theory but never lands on the same sub-pixel boundary across rows in practice — a
 *  faint seam/blur at every row edge — so one unbroken element is the only way to get a crisp
 *  line. */
function RailRow({
  option,
  onSelect,
}: {
  option: StageMoverOption;
  onSelect: (code: CandidateStatus) => void;
}) {
  const blocked = !option.valid && !option.current;
  return (
    <button
      type="button"
      role="option"
      aria-selected={option.current}
      disabled={blocked}
      onClick={() => onSelect(option.code)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition",
        option.current ? "bg-navy/10" : blocked ? "cursor-not-allowed" : "hover:bg-black/[0.03]",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "relative z-10 rounded-full",
            option.current ? "h-2.5 w-2.5 bg-navy" : "h-2 w-2",
            !option.current && (blocked ? "bg-black/15" : "bg-navy/40"),
          )}
        />
      </span>
      <span
        className={cn(
          "flex-1 truncate text-sm",
          option.current ? "font-semibold text-charcoal" : blocked ? "text-gray" : "text-charcoal",
        )}
      >
        {option.label}
      </span>
      {option.current ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-navy"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 10.5 3.5 3.5 7.5-8" />
        </svg>
      ) : blocked ? (
        <Badge tone="neutral" size="sm" className="shrink-0 tracking-wide uppercase">
          Blocked
        </Badge>
      ) : null}
    </button>
  );
}

/** An OUTCOMES row (terminal stages) — same selection behavior, no connecting rail, gold dot. */
function OutcomeRow({
  option,
  onSelect,
}: {
  option: StageMoverOption;
  onSelect: (code: CandidateStatus) => void;
}) {
  const blocked = !option.valid && !option.current;
  return (
    <button
      type="button"
      role="option"
      aria-selected={option.current}
      disabled={blocked}
      onClick={() => onSelect(option.code)}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition",
        option.current ? "bg-navy/10" : blocked ? "cursor-not-allowed" : "hover:bg-black/[0.03]",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        <span
          className={cn(
            "rounded-full",
            option.current ? "h-2.5 w-2.5 bg-brand" : "h-2 w-2",
            !option.current && (blocked ? "bg-black/15" : "bg-brand/60"),
          )}
        />
      </span>
      <span
        className={cn(
          "flex-1 truncate text-sm",
          option.current ? "font-semibold text-charcoal" : blocked ? "text-gray" : "text-charcoal",
        )}
      >
        {option.label}
      </span>
      {option.current ? (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="h-4 w-4 shrink-0 text-navy"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m4.5 10.5 3.5 3.5 7.5-8" />
        </svg>
      ) : blocked ? (
        <Badge tone="neutral" size="sm" className="shrink-0 tracking-wide uppercase">
          Blocked
        </Badge>
      ) : null}
    </button>
  );
}

/**
 * "Move to" — a stepper-rail dropdown (connected dots trace the active pipeline stages; a
 * separate OUTCOMES group below holds the 4 terminal statuses). Replaces the plain native
 * `<select>` — same gating/behavior underneath: OQ-4's client-side `checkStageGate` pre-check
 * disables invalid targets and lists their reasons up front, but the SERVER stays authoritative
 * (a 422 STAGE_BLOCKED still surfaces the server's own reasons inline).
 */
export function StageMover({
  candidate,
  onMoved,
  announce,
}: {
  candidate: CandidateProfileDTO;
  onMoved: (fields: MovedFields) => void;
  announce: (message: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [blockedReasons, setBlockedReasons] = useState<string[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const options = buildStageMoverOptions(
    {
      status: candidate.status as CandidateStatus,
      track: candidate.track as Track,
      credential: candidate.credential,
      licenseState: candidate.licenseState,
      licenseStatus: candidate.licenseStatus as LicenseStatus,
      licenseExpiry: candidate.licenseExpiry,
      population: candidate.population,
      setting: candidate.setting,
      clientId: candidate.clientId,
      email: candidate.email,
      phone: candidate.phone,
    },
    systemClock.now(),
  );
  const pipelineOptions = options.filter((o) => !isTerminalStatus(o.code));
  const outcomeOptions = options.filter((o) => isTerminalStatus(o.code));
  const currentLabel = statusLabel(candidate.status as CandidateStatus);
  const currentIsTerminal = isTerminalStatus(candidate.status as CandidateStatus);

  function select(toStatus: CandidateStatus) {
    setOpen(false);
    if (toStatus === candidate.status) return;
    const label = statusLabel(toStatus);
    // Local pre-check first (parity with the disabled option): block without a round-trip.
    const target = options.find((o) => o.code === toStatus);
    if (target && !target.valid) {
      setBlockedReasons(target.reasons);
      announce(`Move to ${label} blocked: ${target.reasons.join("; ")}`);
      return;
    }
    setBlockedReasons([]);
    startTransition(async () => {
      const result = await postMove(candidate.id, toStatus);
      if (result.ok) {
        onMoved(result.data);
        toast.success(`Moved to ${label}`);
        announce(`Candidate moved to ${label}`);
      } else if (result.failure.code === "STAGE_BLOCKED") {
        const reasons = result.failure.message
          .split(";")
          .map((s) => s.trim())
          .filter(Boolean);
        setBlockedReasons(reasons.length ? reasons : [result.failure.message]);
        toast.error(`Can't move to ${label}`, { description: reasons.join(" · ") });
        announce(`Move blocked: ${reasons.join("; ")}`);
      } else {
        toast.error(messageForFailure(result.failure));
        announce(`Move failed: ${messageForFailure(result.failure)}`);
      }
    });
  }

  return (
    <div ref={rootRef} className="relative flex max-w-xs flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">Move to</span>
      <button
        type="button"
        disabled={pending}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-left text-sm transition focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
      >
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            currentIsTerminal ? "bg-brand" : "bg-navy",
          )}
        />
        <span className="flex-1 truncate font-medium text-charcoal">{currentLabel}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-gray transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 7.5l5 5 5-5" />
        </svg>
      </button>

      {open ? (
        <div
          role="listbox"
          aria-label="Move to stage"
          className="absolute top-full left-0 z-50 mt-1 max-h-[70vh] w-full min-w-[280px] overflow-y-auto rounded-xl border border-black/10 bg-white p-2 shadow-xl"
        >
          <p className="px-2 pt-1 pb-1 text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
            Pipeline
          </p>
          <div className="relative">
            {/* One unbroken line, dot-center to dot-center: 1.125rem = the row's py-2 (0.5rem)
                padding + half the dot wrapper's h-5/w-5 (1.25rem). REM, not a pixel value — this
                app scales its root font-size to 87.5% globally, so a hardcoded 18px (correct only
                at the browser's un-scaled 16px root) would land ~2px off the true dot center and
                read as a blurry/misaligned line. `-translate-x-1/2` centers the line's own width
                on that point, same as the dots use for their own centering. See RailRow's comment
                for why this can't be per-row segments. */}
            <div
              aria-hidden
              className="pointer-events-none absolute top-[1.125rem] bottom-[1.125rem] left-[1.125rem] w-[1.5px] -translate-x-1/2 bg-black/10"
            />
            {pipelineOptions.map((option) => (
              <RailRow key={option.code} option={option} onSelect={select} />
            ))}
          </div>

          <div className="my-2 border-t border-black/5" />

          <p className="px-2 pt-1 pb-1 text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
            Outcomes
          </p>
          {outcomeOptions.map((option) => (
            <OutcomeRow key={option.code} option={option} onSelect={select} />
          ))}
        </div>
      ) : null}

      {blockedReasons.length > 0 ? (
        <ul role="alert" className="mt-0.5 list-disc pl-5 text-xs text-red">
          {blockedReasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
