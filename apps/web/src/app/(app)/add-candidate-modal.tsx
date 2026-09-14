"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@destaworks/ui/button";
import { Modal } from "@destaworks/ui/modal";
import { AddCandidateForm, type ClientOption } from "./candidates/new/add-candidate-form";

/**
 * Add-candidate trigger + modal (Change 2). Renders a `Button` that opens the shared `Modal`
 * containing the existing `AddCandidateForm` — the form's validation, POST, and redirect are
 * unchanged, only its container (page → modal) differs. On a successful create the form calls
 * `onCancel` (closing this dialog) THEN `router.push`es to the new candidate's detail page —
 * `/candidates/[id]` is an intercepted route (opens as a modal over the current view, which stays
 * mounted underneath), so the navigation alone does NOT close this modal (fixed 2026-08-10, same
 * bug class as the Sourcing "Promote lead" dialog). ESC / backdrop / × close it otherwise — except
 * while a create request is in flight (`dismissBlocked`), since dismissing wouldn't cancel it, the
 * candidate still gets created and the modal still navigates a moment later either way.
 *
 * `clients` + `canEditCredential` are resolved by the parent RSC (layout / list page) and passed in
 * so this client component never imports `src/server/**`. The form is only mounted while the modal
 * is open, so its `autoFocus` name field grabs focus exactly when the dialog appears (and never on
 * a closed, hidden form). Extra `Button` props (`variant`, `size`, `className`, …) pass through for
 * the different placements (full-width in the sidebar, inline on the list page).
 */
export function AddCandidateButton({
  clients,
  canEditCredential,
  label = "+ Add candidate",
  ...buttonProps
}: {
  clients: ClientOption[];
  canEditCredential: boolean;
  label?: ReactNode;
} & Omit<ButtonProps, "children" | "onClick">) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add candidate"
        dismissBlocked={pending}
      >
        {open ? (
          <AddCandidateForm
            clients={clients}
            canEditCredential={canEditCredential}
            onCancel={() => setOpen(false)}
            onPendingChange={setPending}
          />
        ) : null}
      </Modal>
    </>
  );
}
