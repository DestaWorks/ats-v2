"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { statusLabel, type CandidateStatus, type LicenseStatus, type Track } from "@/lib/constants";
import type { CandidateProfileDTO } from "@/lib/validation/candidate";
import { Badge } from "@/components/ui/badge";
import { buildStageMoverOptions } from "./lib/stage-mover-options";
import { messageForFailure, postMove, type MovedFields } from "./lib/detail-fetch";
import { Select } from "@/components/ui/select";

/**
 * Current-stage badge + a "Move to…" `<select>` (mirrors the board card's control). OQ-4: a
 * client-side `checkStageGate` pre-check disables invalid targets and lists their reasons — the full
 * detail DTO carries the gate inputs (contact/population/setting) the board card lacks. The SERVER
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
  const selectId = `stage-mover-${candidate.id}`;

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
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray">Stage</span>
        <Badge tone="navy">{statusLabel(candidate.status as CandidateStatus)}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <label htmlFor={selectId} className="sr-only">
          Move candidate to a different stage
        </label>
        <Select
          id={selectId}
          value={candidate.status}
          disabled={pending}
          onChange={(e) => move(e.target.value as CandidateStatus)}
          className="max-w-xs"
        >
          {options.map((o) => (
            <option key={o.code} value={o.code} disabled={!o.valid && !o.current}>
              {o.label}
              {!o.valid && !o.current ? " — blocked" : ""}
            </option>
          ))}
        </Select>
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
