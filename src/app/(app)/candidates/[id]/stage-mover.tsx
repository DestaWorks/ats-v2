"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { statusLabel, type CandidateStatus, type LicenseStatus, type Track } from "@/lib/constants";
import type { CandidateProfileDTO } from "@/lib/validation/candidate";
import { cn } from "@/lib/utils/cn";
import { buildStageMoverOptions } from "./lib/stage-mover-options";
import { messageForFailure, postMove, type MovedFields } from "./lib/detail-fetch";

/**
 * The legacy "MOVE TO" pill row: every stage as a pill — current filled navy, valid targets
 * outlined, gate-blocked targets dimmed with the reasons as a tooltip. OQ-4: a client-side
 * `checkStageGate` pre-check disables invalid targets and lists their reasons — the full detail
 * DTO carries the gate inputs (contact/population/setting) the board card lacks. The SERVER
 * stays authoritative: a `422 STAGE_BLOCKED` still surfaces the server's reasons inline.
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
  const [blockedReasons, setBlockedReasons] = useState<string[]>([]);

  const options = buildStageMoverOptions({
    status: candidate.status as CandidateStatus,
    track: candidate.track as Track,
    credential: candidate.credential,
    licenseState: candidate.licenseState,
    licenseStatus: candidate.licenseStatus as LicenseStatus,
    population: candidate.population,
    setting: candidate.setting,
    clientId: candidate.clientId,
    email: candidate.email,
    phone: candidate.phone,
  });

  function move(toStatus: CandidateStatus) {
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
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">Move to</span>
      <div role="group" aria-label="Move candidate to a stage" className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.code}
            type="button"
            disabled={pending || (!o.valid && !o.current)}
            aria-pressed={o.current}
            onClick={() => move(o.code as CandidateStatus)}
            title={!o.valid && !o.current ? o.reasons.join("; ") : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition",
              "focus-visible:ring-2 focus-visible:ring-navy focus-visible:outline-none",
              o.current
                ? "border-navy bg-navy text-white"
                : o.valid
                  ? "border-black/15 bg-white text-charcoal hover:bg-black/5"
                  : "cursor-not-allowed border-black/10 bg-black/[0.03] text-gray/70",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
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
