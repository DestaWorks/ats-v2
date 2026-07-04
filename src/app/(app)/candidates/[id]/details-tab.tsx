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
} from "@/lib/constants";
import {
  updateCandidateSchema,
  type CandidateProfileDTO,
  type UpdateCandidateInput,
} from "@/lib/validation/candidate";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";
import { fieldError } from "./lib/form-error";
import { inputClass, selectClass } from "./lib/field-styles";
import { messageForFailure, patchCandidate } from "./lib/detail-fetch";

export interface ClientOption {
  id: string;
  name: string;
}

/** Empty-string sentinel → null for optional enum/text fields (RHF setValueAs runs before zod). */
const emptyToNull = (v: unknown) => (v === "" || v == null ? null : v);
const emptyToNullNumber = (v: unknown) =>
  v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);

/** Read-only field row for the meta card. */
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <dt className="text-gray">{label}</dt>
      <dd className="font-medium text-charcoal">{value}</dd>
    </div>
  );
}

export function DetailsTab({
  candidate,
  clients,
  canEditCredential,
  onSaved,
  announce,
}: {
  candidate: CandidateProfileDTO;
  clients: ClientOption[];
  canEditCredential: boolean;
  onSaved: (input: UpdateCandidateInput) => void;
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useZodForm(updateCandidateSchema, {
    defaultValues: {
      name: candidate.name,
      email: candidate.email ?? undefined,
      phone: candidate.phone ?? undefined,
      city: candidate.city ?? undefined,
      state: (candidate.state as UpdateCandidateInput["state"]) ?? undefined,
      employer: candidate.employer ?? undefined,
      yearsExp: candidate.yearsExp ?? undefined,
      credential: (candidate.credential as UpdateCandidateInput["credential"]) ?? undefined,
      population: (candidate.population as UpdateCandidateInput["population"]) ?? undefined,
      setting: (candidate.setting as UpdateCandidateInput["setting"]) ?? undefined,
      track: candidate.track as UpdateCandidateInput["track"],
      source: (candidate.source as UpdateCandidateInput["source"]) ?? undefined,
      tags: (candidate.tags as UpdateCandidateInput["tags"]) ?? [],
      licenseState: (candidate.licenseState as UpdateCandidateInput["licenseState"]) ?? undefined,
      clientId: candidate.clientId ?? undefined,
      ...(canEditCredential ? { licenseNumber: candidate.licenseNumber ?? undefined } : {}),
    },
  });

  function onSubmit(values: UpdateCandidateInput) {
    startTransition(async () => {
      const result = await patchCandidate(candidate.id, values);
      if (result.ok) {
        onSaved(values);
        setEditing(false);
        toast.success("Candidate updated");
        announce("Candidate profile saved");
        router.refresh();
      } else if (result.failure.issues.length) {
        for (const issue of result.failure.issues) {
          form.setError(issue.path as keyof UpdateCandidateInput, { message: issue.message });
        }
        toast.error("Please fix the highlighted fields");
      } else {
        toast.error(messageForFailure(result.failure));
        announce(`Save failed: ${messageForFailure(result.failure)}`);
      }
    });
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Edit
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-bold tracking-wide text-gray uppercase">Contact</h3>
            <dl>
              <MetaRow label="Email" value={candidate.email ?? "—"} />
              <MetaRow label="Phone" value={candidate.phone ?? "—"} />
              <MetaRow
                label="Location"
                value={[candidate.city, candidate.state].filter(Boolean).join(", ") || "—"}
              />
              <MetaRow label="Employer" value={candidate.employer ?? "—"} />
              <MetaRow
                label="Years experience"
                value={candidate.yearsExp != null ? String(candidate.yearsExp) : "—"}
              />
            </dl>
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-xs font-bold tracking-wide text-gray uppercase">Profile</h3>
            <dl>
              <MetaRow label="Credential" value={candidate.credential ?? "—"} />
              <MetaRow label="Population" value={candidate.population ?? "—"} />
              <MetaRow label="Setting" value={candidate.setting ?? "—"} />
              <MetaRow label="Track" value={candidate.track} />
              <MetaRow label="Source" value={candidate.source ?? "—"} />
              <MetaRow
                label="Tags"
                value={candidate.tags.length ? candidate.tags.join(", ") : "—"}
              />
            </dl>
          </Card>
        </div>
      </div>
    );
  }

  const selectedTags = form.watch("tags") ?? [];

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="cd-name" error={fieldError(form, "name")} required>
          <input id="cd-name" className={inputClass} {...form.register("name")} />
        </Field>
        <Field label="Email" htmlFor="cd-email" error={fieldError(form, "email")}>
          <input
            id="cd-email"
            type="email"
            className={inputClass}
            {...form.register("email", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Phone" htmlFor="cd-phone" error={fieldError(form, "phone")}>
          <input
            id="cd-phone"
            className={inputClass}
            {...form.register("phone", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="City" htmlFor="cd-city" error={fieldError(form, "city")}>
          <input
            id="cd-city"
            className={inputClass}
            {...form.register("city", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="State" htmlFor="cd-state" error={fieldError(form, "state")}>
          <select
            id="cd-state"
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
        <Field label="Employer" htmlFor="cd-employer" error={fieldError(form, "employer")}>
          <input
            id="cd-employer"
            className={inputClass}
            {...form.register("employer", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Years experience" htmlFor="cd-years" error={fieldError(form, "yearsExp")}>
          <input
            id="cd-years"
            type="number"
            min={0}
            max={80}
            className={inputClass}
            {...form.register("yearsExp", { setValueAs: emptyToNullNumber })}
          />
        </Field>
        <Field label="Credential" htmlFor="cd-cred" error={fieldError(form, "credential")}>
          <select
            id="cd-cred"
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
        <Field label="Population" htmlFor="cd-pop" error={fieldError(form, "population")}>
          <select
            id="cd-pop"
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
        <Field label="Setting" htmlFor="cd-setting" error={fieldError(form, "setting")}>
          <select
            id="cd-setting"
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
        <Field label="Track" htmlFor="cd-track" error={fieldError(form, "track")}>
          <select id="cd-track" className={selectClass} {...form.register("track")}>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source" htmlFor="cd-source" error={fieldError(form, "source")}>
          <select
            id="cd-source"
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
        <Field label="License state" htmlFor="cd-licstate" error={fieldError(form, "licenseState")}>
          <select
            id="cd-licstate"
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
        <Field label="Client" htmlFor="cd-client" error={fieldError(form, "clientId")}>
          <select
            id="cd-client"
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
        {canEditCredential ? (
          <Field
            label="License number"
            htmlFor="cd-licnum"
            error={fieldError(form, "licenseNumber")}
            hint="Only visible to credential-cleared roles"
          >
            <input
              id="cd-licnum"
              className={inputClass}
              {...form.register("licenseNumber", { setValueAs: emptyToNull })}
            />
          </Field>
        ) : null}
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
          Save changes
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            form.reset();
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
