"use client";

import { useState } from "react";
import { toast } from "sonner";
import { addProspectSchema } from "@/lib/validation/prospect";
import type { ProspectDetailDTO } from "@/lib/validation/prospect";
import { CLIENT_DISCOVERY_SPECIALTY_GROUPS } from "@/lib/constants";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { postJson } from "@/lib/api/client";
import type { PostProspectResponse } from "@/app/api/prospects/route";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { fieldError } from "../candidates/[id]/lib/form-error";

/**
 * Add-prospect trigger + modal — mirrors `sourcing/add-lead-modal.tsx`. A header `Button` opens
 * the shared `Modal` with a `useZodForm(addProspectSchema)` form — the SAME schema
 * `POST /api/prospects` enforces. On success it POSTs, toasts, closes, and calls `onAdded` so the
 * inventory can prepend the new "Fresh Lead" prospect (no refetch).
 */
export function AddProspectButton({
  onAdded,
  label = "+ Add prospect",
  ...buttonProps
}: {
  onAdded?: (prospect: ProspectDetailDTO) => void;
  label?: string;
} & Omit<ButtonProps, "children" | "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add prospect">
        {open ? <AddProspectForm onAdded={onAdded} onDone={() => setOpen(false)} /> : null}
      </Modal>
    </>
  );
}

function AddProspectForm({
  onAdded,
  onDone,
}: {
  onAdded?: (prospect: ProspectDetailDTO) => void;
  onDone: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const { form, pending, onSubmit } = useApiForm(addProspectSchema, {
    defaultValues: { practiceName: "" },
    submit: (values) => postJson<PostProspectResponse>("/api/prospects", values),
    onSuccess: (data) => {
      toast.success("Prospect added");
      onAdded?.(data.prospect);
      onDone();
    },
    onFailure: setServerError,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError ? <ErrorState message={serverError} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Practice name"
          htmlFor="ap-name"
          error={fieldError(form, "practiceName")}
          required
          className="sm:col-span-2"
        >
          <Input id="ap-name" autoFocus {...form.register("practiceName")} />
        </Field>
        <Field label="Specialty" htmlFor="ap-taxonomy" error={fieldError(form, "taxonomy")}>
          <Select id="ap-taxonomy" {...form.register("taxonomy", { setValueAs: emptyToNull })}>
            <option value="">— Any —</option>
            {CLIENT_DISCOVERY_SPECIALTY_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Phone" htmlFor="ap-phone" error={fieldError(form, "phone")}>
          <Input id="ap-phone" {...form.register("phone", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="City" htmlFor="ap-city" error={fieldError(form, "city")}>
          <Input id="ap-city" {...form.register("city", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="State" htmlFor="ap-state" error={fieldError(form, "state")}>
          <Input id="ap-state" {...form.register("state", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Zip" htmlFor="ap-zip" error={fieldError(form, "zip")}>
          <Input id="ap-zip" {...form.register("zip", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Website" htmlFor="ap-website" error={fieldError(form, "website")}>
          <Input
            id="ap-website"
            type="url"
            {...form.register("website", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field
          label="Notes"
          htmlFor="ap-notes"
          error={fieldError(form, "notes")}
          className="sm:col-span-2"
        >
          <textarea
            id="ap-notes"
            rows={3}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none disabled:opacity-50"
            {...form.register("notes", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Prospect
        </Button>
      </div>
    </form>
  );
}
