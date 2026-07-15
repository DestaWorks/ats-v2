"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CREDENTIALS,
  POPULATIONS,
  SETTINGS,
  SOURCES,
  TELEHEALTH_PREFS,
  TAGS,
  TRACKS,
  US_STATES,
  type Track,
} from "@/lib/constants";
import { createCandidateSchema, type CreateCandidateInput } from "@/lib/validation/candidate";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { emptyToNull, emptyToNullNumber } from "@/lib/forms/empty-to-null";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { ErrorState } from "@/components/ui/error-state";
import { fieldError } from "../[id]/lib/form-error";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { messageForFailure, postCandidate } from "./lib/create-fetch";
import { trackFieldVisibility } from "./lib/track-fields";

export interface ClientOption {
  id: string;
  name: string;
}

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
  onCancel,
}: {
  clients: ClientOption[];
  canEditCredential: boolean;
  /** How Cancel behaves: provided (modal) → close the dialog; omitted (standalone page) → go to /pipeline. */
  onCancel?: () => void;
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

      {/* Field labels + order follow the LEGACY Add New Candidate modal. Deliberate deltas:
          residence State is kept (it drives the 30-pt state-match scoring; legacy captured it
          elsewhere); legacy's Contact Source (write-only duplicate of Source) and Target
          Locations (needs client_locations — ports with Open Roles 3.5) are omitted. */}
      <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
        <Field label="Full Name" htmlFor="ac-name" error={fieldError(form, "name")} required>
          <Input id="ac-name" autoFocus {...form.register("name")} />
        </Field>
        <Field label="Track" htmlFor="ac-track" error={fieldError(form, "track")} required>
          <Select id="ac-track" {...form.register("track")}>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        {showCredential ? (
          <Field label="Credential" htmlFor="ac-cred" error={fieldError(form, "credential")}>
            <Select id="ac-cred" {...form.register("credential", { setValueAs: emptyToNull })}>
              <option value="">Select…</option>
              {CREDENTIALS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {showLicenseState ? (
          <Field
            label="License State"
            htmlFor="ac-licstate"
            error={fieldError(form, "licenseState")}
          >
            <Select
              id="ac-licstate"
              {...form.register("licenseState", { setValueAs: emptyToNull })}
            >
              <option value="">Select…</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        {showLicenseNumber ? (
          <Field
            label="License #"
            htmlFor="ac-licnum"
            error={fieldError(form, "licenseNumber")}
            hint="Only visible to credential-cleared roles"
          >
            <Input
              id="ac-licnum"
              {...form.register("licenseNumber", { setValueAs: emptyToNull })}
            />
          </Field>
        ) : null}
        <Field label="Client" htmlFor="ac-client" error={fieldError(form, "clientId")}>
          <Select id="ac-client" {...form.register("clientId", { setValueAs: emptyToNull })}>
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="ac-source" error={fieldError(form, "source")}>
          <Select id="ac-source" {...form.register("source", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Email" htmlFor="ac-email" error={fieldError(form, "email")}>
          <Input
            id="ac-email"
            type="email"
            {...form.register("email", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Phone" htmlFor="ac-phone" error={fieldError(form, "phone")}>
          <Input id="ac-phone" {...form.register("phone", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="City" htmlFor="ac-city" error={fieldError(form, "city")}>
          <Input id="ac-city" {...form.register("city", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="State" htmlFor="ac-state" error={fieldError(form, "state")}>
          <Select id="ac-state" {...form.register("state", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Employer" htmlFor="ac-employer" error={fieldError(form, "employer")}>
          <Input id="ac-employer" {...form.register("employer", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Population" htmlFor="ac-pop" error={fieldError(form, "population")}>
          <Select id="ac-pop" {...form.register("population", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {POPULATIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Setting" htmlFor="ac-setting" error={fieldError(form, "setting")}>
          <Select id="ac-setting" {...form.register("setting", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Telehealth" htmlFor="ac-tele" error={fieldError(form, "telehealthPref")}>
          <Select id="ac-tele" {...form.register("telehealthPref", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {TELEHEALTH_PREFS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Years Exp" htmlFor="ac-years" error={fieldError(form, "yearsExp")}>
          <Input
            id="ac-years"
            type="number"
            min={0}
            max={80}
            {...form.register("yearsExp", { setValueAs: emptyToNullNumber })}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2">
        {/* Legacy section-label style; the checkbox mechanics stay (deliberate — see 2026-07-11). */}
        <legend className="text-[11px] font-bold tracking-[0.08em] text-gray uppercase">
          Tags
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {TAGS.map((tag) => {
            const checked = selectedTags.includes(tag);
            return (
              <label key={tag} className="flex items-center gap-1.5 text-sm text-charcoal">
                <input
                  type="checkbox"
                  className="accent-navy"
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

      {/* Legacy footer: actions right-aligned above a hairline — Cancel, then the GREEN commit. */}
      <div className="flex items-center justify-end gap-2 border-t border-black/5 pt-4">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => (onCancel ? onCancel() : router.push("/pipeline"))}
        >
          Cancel
        </Button>
        <Button type="submit" variant="success" loading={pending}>
          Add Candidate
        </Button>
      </div>
    </form>
  );
}
