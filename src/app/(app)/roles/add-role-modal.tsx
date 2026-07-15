"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CREDENTIALS, POPULATIONS, ROLE_PRIORITIES, SETTINGS, US_STATES } from "@/lib/constants";
import {
  createOpenRoleSchema,
  type CreateOpenRoleInput,
  type ParsedJdDTO,
} from "@/lib/validation/open-role";
import type { OpenRoleDetailDTO } from "@/lib/validation/open-role";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { emptyToNull } from "@/lib/forms/empty-to-null";
import { messageForFailure, postJson } from "@/lib/api/client";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { fieldError } from "../candidates/[id]/lib/form-error";

export interface ClientOption {
  id: string;
  name: string;
}

/**
 * Add-role trigger + modal (Wave 3.5) — mirrors `AddCandidateButton` exactly: a standalone
 * `Button` + `Modal`, rendered in the PAGE HEADER (next to the "Open Roles" title, not inside the
 * table toolbar — matches `candidates/page.tsx`). On a successful create the form `router.push`es
 * to the new role's detail page, which unmounts the modal (implicit close) — no `onAdded`
 * callback / list-prepend wiring needed.
 */
export function AddRoleButton({
  clients,
  label = "+ Add role",
  ...buttonProps
}: {
  clients: ClientOption[];
  label?: string;
} & Omit<ButtonProps, "children" | "onClick">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)} {...buttonProps}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add role">
        {open ? <AddRoleForm clients={clients} onCancel={() => setOpen(false)} /> : null}
      </Modal>
    </>
  );
}

function AddRoleForm({ clients, onCancel }: { clients: ClientOption[]; onCancel: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [jdText, setJdText] = useState("");
  const [jdPending, startJdTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useZodForm(createOpenRoleSchema, {
    defaultValues: { title: "", priority: "P2" },
  });

  function handleAutofill() {
    startJdTransition(async () => {
      const result = await postJson<ParsedJdDTO>("/api/roles/parse-jd", { text: jdText });
      if (result.ok) {
        const jd = result.data;
        if (jd.title) form.setValue("title", jd.title);
        if (jd.credential && (CREDENTIALS as readonly string[]).includes(jd.credential)) {
          form.setValue("credential", jd.credential as CreateOpenRoleInput["credential"]);
        }
        if (jd.state && (US_STATES as readonly string[]).includes(jd.state)) {
          form.setValue("state", jd.state as CreateOpenRoleInput["state"]);
        }
        if (jd.city) form.setValue("city", jd.city);
        if (jd.setting && (SETTINGS as readonly string[]).includes(jd.setting)) {
          form.setValue("setting", jd.setting as CreateOpenRoleInput["setting"]);
        }
        if (jd.population && (POPULATIONS as readonly string[]).includes(jd.population)) {
          form.setValue("population", jd.population as CreateOpenRoleInput["population"]);
        }
        if (jd.rate) form.setValue("rate", jd.rate);
        if (jd.description) form.setValue("description", jd.description);
        form.setValue("priority", jd.priority);
        toast.success("Autofilled from the job description — review before saving");
      } else {
        toast.error(messageForFailure(result.failure));
      }
    });
  }

  function onSubmit(values: CreateOpenRoleInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await postJson<{ role: OpenRoleDetailDTO }>("/api/roles", values);
      if (result.ok) {
        toast.success("Role added");
        router.push(`/roles/${result.data.role.id}`);
      } else if (result.failure.issues.length) {
        for (const issue of result.failure.issues) {
          form.setError(issue.path as keyof CreateOpenRoleInput, { message: issue.message });
        }
        toast.error("Please fix the highlighted fields");
      } else {
        setServerError(messageForFailure(result.failure));
        toast.error(messageForFailure(result.failure));
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      {serverError ? <ErrorState message={serverError} /> : null}

      <div className="flex flex-col gap-2 rounded-md border border-black/10 bg-black/[0.02] p-3">
        <label htmlFor="ar-jd" className="text-sm font-medium text-charcoal">
          Paste a job description (optional)
        </label>
        <textarea
          id="ar-jd"
          rows={4}
          className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none"
          value={jdText}
          onChange={(e) => setJdText(e.target.value)}
        />
        <Button
          type="button"
          variant="purple"
          size="sm"
          loading={jdPending}
          disabled={jdText.trim().length < 10}
          onClick={handleAutofill}
          className="self-start"
        >
          ✨ Autofill from JD
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Target client"
          htmlFor="ar-client"
          error={fieldError(form, "clientId")}
          required
        >
          <Select id="ar-client" {...form.register("clientId")}>
            <option value="">Select client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Title" htmlFor="ar-title" error={fieldError(form, "title")} required>
          <Input id="ar-title" autoFocus {...form.register("title")} />
        </Field>
        <Field label="Credential" htmlFor="ar-cred" error={fieldError(form, "credential")}>
          <Select id="ar-cred" {...form.register("credential", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CREDENTIALS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="State" htmlFor="ar-state" error={fieldError(form, "state")}>
          <Select id="ar-state" {...form.register("state", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="City" htmlFor="ar-city" error={fieldError(form, "city")}>
          <Input id="ar-city" {...form.register("city", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Setting" htmlFor="ar-setting" error={fieldError(form, "setting")}>
          <Select id="ar-setting" {...form.register("setting", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Population" htmlFor="ar-population" error={fieldError(form, "population")}>
          <Select id="ar-population" {...form.register("population", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {POPULATIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Rate"
          htmlFor="ar-rate"
          error={fieldError(form, "rate")}
          hint="e.g. $75-90/hr"
        >
          <Input id="ar-rate" {...form.register("rate", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Priority" htmlFor="ar-priority" error={fieldError(form, "priority")}>
          <Select id="ar-priority" {...form.register("priority")}>
            {ROLE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Description"
          htmlFor="ar-description"
          error={fieldError(form, "description")}
          className="sm:col-span-2"
        >
          <textarea
            id="ar-description"
            rows={3}
            className="w-full resize-y rounded-md border border-black/15 px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-navy focus:outline-none disabled:opacity-50"
            {...form.register("description", { setValueAs: emptyToNull })}
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button type="button" variant="secondary" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Role
        </Button>
      </div>
    </form>
  );
}
