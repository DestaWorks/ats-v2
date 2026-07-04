"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CREDENTIALS,
  POPULATIONS,
  SETTINGS,
  SOURCES,
  TAGS,
  TRACKS,
  US_STATES,
  type Track,
} from "@/lib/constants";
import { createCandidateSchema, type CreateCandidateInput } from "@/lib/validation/candidate";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/error-state";
import { fieldError } from "../[id]/lib/form-error";
import { inputClass, selectClass } from "../[id]/lib/field-styles";
import { messageForFailure, postCandidate } from "./lib/create-fetch";
import { trackFieldVisibility } from "./lib/track-fields";

export interface ClientOption {
  id: string;
  name: string;
}

/** Empty-string sentinel → null for optional enum/text fields (RHF setValueAs runs before zod). */
const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);
const emptyToNullNumber = (v: unknown) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);

/**
 * Add-candidate form (Wave 2.4). Track-aware: `Clinical`/`Prescriber` surface credential + license
 * fields (license-number only for a `viewCredentials` viewer, via `canEditCredential`), while
 * `Operations` focuses on contact info and hides the license block (`trackFieldVisibility`). Validates
 * with the shared `createCandidateSchema` (same shape the route enforces); on success POSTs to
 * `/api/candidates` and redirects to the new candidate's detail page. Field-level 422 issues map to
 * `form.setError`; other failures render an `ErrorState`.
 */
export function AddCandidateForm({
  clients,
  canEditCredential,
}: {
  clients: ClientOption[];
  canEditCredential: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useZodForm(createCandidateSchema, {
    defaultValues: {
      name: "",
      track: "Clinical",
      tags: [],
    },
  });

  const track = (form.watch("track") ?? "Clinical") as Track;
  const { showCredential, showLicenseState, showLicenseNumber } = trackFieldVisibility(
    track,
    canEditCredential,
  );
  const selectedTags = form.watch("tags") ?? [];

  function onSubmit(values: CreateCandidateInput) {
    setServerError(null);
    startTransition(async () => {
      const result = await postCandidate(values);
      if (result.ok) {
        toast.success("Candidate created");
        router.push(`/candidates/${result.data.id}`);
        router.refresh();
      } else if (result.failure.issues.length) {
        for (const issue of result.failure.issues) {
          form.setError(issue.path as keyof CreateCandidateInput, { message: issue.message });
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="ac-name" error={fieldError(form, "name")} required>
          <input id="ac-name" className={inputClass} autoFocus {...form.register("name")} />
        </Field>
        <Field label="Track" htmlFor="ac-track" error={fieldError(form, "track")} required>
          <select id="ac-track" className={selectClass} {...form.register("track")}>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Email" htmlFor="ac-email" error={fieldError(form, "email")}>
          <input
            id="ac-email"
            type="email"
            className={inputClass}
            {...form.register("email", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Phone" htmlFor="ac-phone" error={fieldError(form, "phone")}>
          <input
            id="ac-phone"
            className={inputClass}
            {...form.register("phone", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="City" htmlFor="ac-city" error={fieldError(form, "city")}>
          <input
            id="ac-city"
            className={inputClass}
            {...form.register("city", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="State" htmlFor="ac-state" error={fieldError(form, "state")}>
          <select
            id="ac-state"
            className={selectClass}
            {...form.register("state", { setValueAs: emptyToNull })}
          >
            <option value="">—</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employer" htmlFor="ac-employer" error={fieldError(form, "employer")}>
          <input
            id="ac-employer"
            className={inputClass}
            {...form.register("employer", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Years experience" htmlFor="ac-years" error={fieldError(form, "yearsExp")}>
          <input
            id="ac-years"
            type="number"
            min={0}
            max={80}
            className={inputClass}
            {...form.register("yearsExp", { setValueAs: emptyToNullNumber })}
          />
        </Field>
        {showCredential ? (
          <Field label="Credential" htmlFor="ac-cred" error={fieldError(form, "credential")}>
            <select
              id="ac-cred"
              className={selectClass}
              {...form.register("credential", { setValueAs: emptyToNull })}
            >
              <option value="">—</option>
              {CREDENTIALS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Population" htmlFor="ac-pop" error={fieldError(form, "population")}>
          <select
            id="ac-pop"
            className={selectClass}
            {...form.register("population", { setValueAs: emptyToNull })}
          >
            <option value="">—</option>
            {POPULATIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Setting" htmlFor="ac-setting" error={fieldError(form, "setting")}>
          <select
            id="ac-setting"
            className={selectClass}
            {...form.register("setting", { setValueAs: emptyToNull })}
          >
            <option value="">—</option>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source" htmlFor="ac-source" error={fieldError(form, "source")}>
          <select
            id="ac-source"
            className={selectClass}
            {...form.register("source", { setValueAs: emptyToNull })}
          >
            <option value="">—</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {showLicenseState ? (
          <Field
            label="License state"
            htmlFor="ac-licstate"
            error={fieldError(form, "licenseState")}
          >
            <select
              id="ac-licstate"
              className={selectClass}
              {...form.register("licenseState", { setValueAs: emptyToNull })}
            >
              <option value="">—</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        {showLicenseNumber ? (
          <Field
            label="License number"
            htmlFor="ac-licnum"
            error={fieldError(form, "licenseNumber")}
            hint="Only visible to credential-cleared roles"
          >
            <input
              id="ac-licnum"
              className={inputClass}
              {...form.register("licenseNumber", { setValueAs: emptyToNull })}
            />
          </Field>
        ) : null}
        <Field label="Client" htmlFor="ac-client" error={fieldError(form, "clientId")}>
          <select
            id="ac-client"
            className={selectClass}
            {...form.register("clientId", { setValueAs: emptyToNull })}
          >
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-charcoal">Tags</legend>
        <div className="flex flex-wrap gap-3">
          {TAGS.map((tag) => {
            const checked = selectedTags.includes(tag);
            return (
              <label key={tag} className="flex items-center gap-1.5 text-sm text-charcoal">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selectedTags, tag]
                      : selectedTags.filter((t) => t !== tag);
                    form.setValue("tags", next, { shouldDirty: true });
                  }}
                />
                {tag}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" loading={pending}>
          Create candidate
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => router.push("/pipeline")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
