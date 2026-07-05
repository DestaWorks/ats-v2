"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { deleteCandidate, messageForFailure } from "../../trash/lib/trash-actions";

/**
 * Delete entry point on the candidate detail header (D-7). Opens a simple `Modal` confirm ("Move to
 * Trash?") — reversible, so no type-to-confirm — then `DELETE /api/candidates/[id]` (soft-delete). On
 * success the candidate leaves the board/list/detail (D-9), so we `router.push("/pipeline")` and
 * toast; it can be restored from the Trash page. Failures surface via `messageForFailure`.
 */
export function DeleteCandidateButton({
  candidateId,
  candidateName,
  announce,
}: {
  candidateId: string;
  candidateName: string;
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function close() {
    if (pending) return;
    setOpen(false);
  }

  function confirm() {
    if (pending) return;
    startTransition(async () => {
      const result = await deleteCandidate(candidateId);
      if (result.ok) {
        toast.success(`Moved ${candidateName} to Trash`);
        announce(`Moved ${candidateName} to Trash`);
        router.push("/pipeline");
      } else {
        const message = messageForFailure(result.failure);
        toast.error(message);
        announce(`Delete failed: ${message}`);
        setOpen(false);
      }
    });
  }

  return (
    <>
      <Button type="button" variant="danger" size="sm" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Modal open={open} onClose={close} title="Move to Trash?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-charcoal">
            This moves <strong>{candidateName}</strong> to Trash. You can restore them later from
            the Trash page.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" variant="danger" onClick={confirm} loading={pending}>
              Move to Trash
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
