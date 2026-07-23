"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CLIENT_PRIORITIES } from "@/lib/constants";
import { createClientSchema, type ClientProfileDTO } from "@/lib/validation/client";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { postJson } from "@/lib/api/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { fieldError } from "../candidates/[id]/lib/form-error";

/**
 * Add-client trigger + modal (Wave 4.2, CRM slice 1) — mirrors `AddRoleButton` exactly: a
 * standalone `Button` + `Modal` in the page header, `router.push`es to the new client's detail
 * page on success (implicit close, no `onAdded` callback needed).
 */
export function AddClientButton({
  label = "+ Add client",
  ...buttonProps
}: { label?: string } & Omit<ButtonProps, "children" | "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add client">
        {open ? <AddClientForm onCancel={() => setOpen(false)} /> : null}
      </Modal>
    </>
  );
}

function AddClientForm({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { form, pending, onSubmit } = useApiForm(createClientSchema, {
    defaultValues: { name: "" },
    submit: (values) => postJson<{ client: ClientProfileDTO }>("/api/crm/clients", values),
    onSuccess: (data) => {
      toast.success("Client added");
      router.push(`/crm/${data.client.id}`);
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {serverError ? <ErrorState message={serverError} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor="ac-name"
          error={fieldError(form, "name")}
          required
          className="sm:col-span-2"
        >
          <Input id="ac-name" autoFocus {...form.register("name")} />
        </Field>
        <Field label="Primary contact" htmlFor="ac-contact" error={fieldError(form, "contact")}>
          <Input id="ac-contact" {...form.register("contact", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Location" htmlFor="ac-location" error={fieldError(form, "location")}>
          <Input id="ac-location" {...form.register("location", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Priority" htmlFor="ac-priority" error={fieldError(form, "priority")}>
          <Select id="ac-priority" {...form.register("priority", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CLIENT_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Client
        </Button>
      </div>
    </form>
  );
}
