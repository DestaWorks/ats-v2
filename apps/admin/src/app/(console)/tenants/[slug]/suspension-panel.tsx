"use client";

import { useState, useTransition } from "react";
import {
  TENANT_SUSPENSION_REASONS,
  type TenantSuspensionReason,
} from "@destaworks/contracts/validation/tenant";
import { Button } from "@destaworks/ui/button";
import { ErrorState } from "@destaworks/ui/error-state";
import { Select } from "@destaworks/ui/select";
import { restoreAction, suspendAction } from "./actions";

const REASON_LABEL: Record<TenantSuspensionReason, string> = {
  nonpayment: "Non-payment",
  abuse: "Abuse",
  security: "Security",
  "customer-request": "Customer request",
  "trial-expired": "Trial expired",
  other: "Other",
};

/**
 * Suspend or restore one workspace.
 *
 * Suspension refuses EVERY member on their next request and destroys nothing — a restore returns
 * the workspace with its data untouched. It is still confirmed before it fires, because the people
 * it locks out are a customer's staff mid-shift.
 */
export function SuspensionPanel({ slug, suspended }: { slug: string; suspended: boolean }) {
  const [reason, setReason] = useState<TenantSuspensionReason>("nonpayment");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.message);
      setConfirming(false);
    });
  }

  if (suspended) {
    return (
      <div className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="text-sm font-semibold text-charcoal">Suspended</h2>
        <p className="mt-1 mb-3 text-sm text-gray">
          Every member is refused until this is lifted. No data was deleted.
        </p>
        {error ? <ErrorState className="mb-3" message={error} /> : null}
        <Button disabled={pending} onClick={() => run(() => restoreAction(slug))}>
          {pending ? "Restoring…" : "Restore access"}
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4">
      <h2 className="text-sm font-semibold text-charcoal">Suspend this workspace</h2>
      <p className="mt-1 mb-3 text-sm text-gray">
        Refuses every member on their next request. Nothing is deleted, and a restore brings it back
        untouched. The reason is written into this workspace&apos;s own activity log.
      </p>

      {error ? <ErrorState className="mb-3" message={error} /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Suspension reason"
          value={reason}
          disabled={pending}
          onChange={(e) => setReason(e.target.value as TenantSuspensionReason)}
          className="h-9 w-52"
        >
          {TENANT_SUSPENSION_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABEL[r]}
            </option>
          ))}
        </Select>

        {confirming ? (
          <>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() => run(() => suspendAction(slug, reason))}
            >
              {pending ? "Suspending…" : "Yes, suspend"}
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Suspend
          </Button>
        )}
      </div>
    </div>
  );
}
