"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { AddCandidateForm, type ClientOption } from "./candidates/new/add-candidate-form";

/**
 * Add-candidate trigger + modal (Change 2). Renders a `Button` that opens the shared `Modal`
 * containing the existing `AddCandidateForm` — the form's validation, POST, and redirect are
 * unchanged, only its container (page → modal) differs. On a successful create the form
 * `router.push`es to the new candidate's detail page, which unmounts the modal (implicit close);
 * ESC / backdrop / × close it otherwise.
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
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add candidate">
        {open ? (
          <AddCandidateForm
            clients={clients}
            canEditCredential={canEditCredential}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </Modal>
    </>
  );
}
