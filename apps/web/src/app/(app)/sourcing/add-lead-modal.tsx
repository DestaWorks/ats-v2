"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SOURCES } from "@destaworks/domain/constants";
import {
  addLeadSchema,
  type LeadEnvelope as PostLeadResponse,
} from "@destaworks/contracts/validation/lead";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { postJson } from "@/lib/api/client";
import type { LeadDetailDTO } from "@destaworks/contracts/validation/lead";
import { Button, type ButtonProps } from "@destaworks/ui/button";
import { Field } from "@destaworks/ui/field";
import { Input } from "@destaworks/ui/input";
import { Select } from "@destaworks/ui/select";
import { ErrorState } from "@destaworks/ui/error-state";
import { Modal } from "@destaworks/ui/modal";
import { fieldErrorProps } from "../lib/field-error-props";

export interface ClientOption {
  id: string;
  name: string;
}

/** Comma-separated text → a de-duped, trimmed tag array (matches the free-text `tags` schema). */
const commaToTags = (v: unknown) =>
  typeof v === "string"
    ? Array.from(
        new Set(
          v
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        ),
      )
    : (v ?? []);

/**
 * Add-lead trigger + modal (Wave 2.6). A header `Button` opens the shared `Modal` with a
 * `useZodForm(addLeadSchema)` form — the SAME schema the `POST /api/leads` route enforces, so client
 * and server validate identically. `name` is required; everything else is optional free text (the
 * sourcing vocab — credential/state/source/tags — is intentionally free text, coerced later at
 * promote). On success it POSTs, toasts, closes, and `router.refresh()`es so the new "Sourced" lead
 * appears at the top of the inventory; field-level 422 issues map back to `form.setError`. The form is
 * only mounted while the modal is open so its `autoFocus` name field grabs focus when the dialog
 * opens. `clients` comes from the parent RSC (no `src/server/**` import here).
 */
export function AddLeadButton({
  clients,
  onAdded,
  label = "+ Add lead",
  ...buttonProps
}: {
  clients: ClientOption[];
  /** Called with the freshly created lead so the inventory can prepend it (snappy — no refetch). */
  onAdded?: (lead: LeadDetailDTO) => void;
  label?: string;
} & Omit<ButtonProps, "children" | "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add lead">
        {open ? (
          <AddLeadForm
            clients={clients}
            {...(onAdded !== undefined && { onAdded })}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </Modal>
    </>
  );
}

function AddLeadForm({
  clients,
  onAdded,
  onDone,
}: {
  clients: ClientOption[];
  onAdded?: (lead: LeadDetailDTO) => void;
  onDone: () => void;
}) {
  const [serverError, setServerError] = useState<string | null>(null);

  const { form, pending, onSubmit } = useApiForm(addLeadSchema, {
    defaultValues: { name: "", tags: [] },
    submit: (values) => postJson<PostLeadResponse>("/api/leads", values),
    onSuccess: (data) => {
      toast.success("Lead added");
      onAdded?.(data.lead);
      onDone();
    },
    onFailure: setServerError,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      {serverError ? <ErrorState message={serverError} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="al-name" {...fieldErrorProps(form, "name")} required>
          <Input id="al-name" autoFocus {...form.register("name")} />
        </Field>
        <Field label="Email" htmlFor="al-email" {...fieldErrorProps(form, "email")}>
          <Input
            id="al-email"
            type="email"
            {...form.register("email", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Phone" htmlFor="al-phone" {...fieldErrorProps(form, "phone")}>
          <Input id="al-phone" {...form.register("phone", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="LinkedIn URL" htmlFor="al-linkedin" {...fieldErrorProps(form, "linkedinUrl")}>
          <Input
            id="al-linkedin"
            type="url"
            {...form.register("linkedinUrl", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Credential" htmlFor="al-cred" {...fieldErrorProps(form, "credential")}>
          <Input
            id="al-cred"
            placeholder="e.g. PMHNP"
            {...form.register("credential", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="State" htmlFor="al-state" {...fieldErrorProps(form, "state")}>
          <Input id="al-state" {...form.register("state", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Source" htmlFor="al-source" {...fieldErrorProps(form, "source")}>
          <Select id="al-source" {...form.register("source", { setValueAs: emptyToNull })}>
            <option value="">Select source…</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Target client" htmlFor="al-client" {...fieldErrorProps(form, "clientId")}>
          <Select id="al-client" {...form.register("clientId", { setValueAs: emptyToNull })}>
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Tags"
          htmlFor="al-tags"
          {...fieldErrorProps(form, "tags")}
          hint="Comma-separated"
          className="sm:col-span-2"
        >
          <Input
            id="al-tags"
            placeholder="e.g. bilingual, night shift"
            {...form.register("tags", { setValueAs: commaToTags })}
          />
        </Field>
        <Field
          label="Notes"
          htmlFor="al-notes"
          {...fieldErrorProps(form, "notes")}
          className="sm:col-span-2"
        >
          <textarea
            id="al-notes"
            rows={3}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none disabled:opacity-50"
            {...form.register("notes", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>

      {/* Legacy footer: actions right-aligned above a hairline — Cancel, then the GREEN commit. */}
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Lead
        </Button>
      </div>
    </form>
  );
}
