"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { canConfirmPurge, messageForFailure, purgeCandidate } from "./lib/trash-actions";

/**
 * Irreversible-purge confirm dialog (D-8). Spells out the CASCADE explicitly, then gates the red
 * **Purge permanently** button behind a type-to-confirm input — the operator must retype the
 * candidate's exact name (`canConfirmPurge`). On success it calls `onPurged` so the parent drops the
 * row; a 403 (capability changed mid-session) / any failure surfaces via `messageForFailure`. Only
 * mounted for capability holders — the server re-enforces `purgeCandidate` regardless.
 */
export function PurgeCandidateModal({
  open,
  candidateId,
  candidateName,
  onClose,
  onPurged,
}: {
  open: boolean;
  candidateId: string;
  candidateName: string;
  onClose: () => void;
  onPurged: (id: string, name: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const confirmed = canConfirmPurge(typed, candidateName);

  function close() {
    if (pending) return;
    setTyped("");
    onClose();
  }

  function confirm() {
    if (!confirmed || pending) return;
    startTransition(async () => {
      const result = await purgeCandidate(candidateId);
      if (result.ok) {
        toast.success(`Purged ${candidateName}`);
        onPurged(candidateId, candidateName);
        setTyped("");
      } else {
        toast.error(messageForFailure(result.failure));
      }
    });
  }

  return (
    <Modal open={open} onClose={close} title="Purge permanently?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-charcoal">
          This <strong>permanently deletes {candidateName}</strong> and all of their documents,
          notes, and stage history. This cannot be undone.
        </p>

        <Field
          label={`Type "${candidateName}" to confirm`}
          htmlFor={inputId}
          hint="Case-sensitive."
        >
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={pending}
            autoComplete="off"
            autoFocus
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={confirm}
            disabled={!confirmed}
            loading={pending}
          >
            Purge permanently
          </Button>
        </div>
      </div>
    </Modal>
  );
}
