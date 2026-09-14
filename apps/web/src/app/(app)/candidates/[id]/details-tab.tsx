"use client";

import { useState } from "react";
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
} from "@destaworks/domain/constants";
import {
  updateCandidateSchema,
  type CandidateProfileDTO,
  type UpdateCandidateInput,
} from "@destaworks/contracts/validation/candidate";
import { useApiForm } from "@/lib/forms/use-api-form";
import { emptyToNull, emptyToNullNumber } from "@/lib/forms/empty-to-null";
import { Button } from "@destaworks/ui/button";
import { Field } from "@destaworks/ui/field";
import { Card } from "@destaworks/ui/card";
import { fieldErrorProps } from "../../lib/field-error-props";
import { Input } from "@destaworks/ui/input";
import { Select } from "@destaworks/ui/select";
import { patchCandidate } from "./lib/detail-fetch";

export interface ClientOption {
  id: string;
  name: string;
}

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

  const { form, pending, onSubmit } = useApiForm(updateCandidateSchema, {
    defaultValues: {
      name: candidate.name,
      email: candidate.email ?? undefined,
      phone: candidate.phone ?? undefined,
      city: candidate.city ?? undefined,
      state: (candidate.state as UpdateCandidateInput["state"]) ?? undefined,
      targetLocation: candidate.targetLocation ?? undefined,
      employer: candidate.employer ?? undefined,
      yearsExp: candidate.yearsExp ?? undefined,
      credential: (candidate.credential as UpdateCandidateInput["credential"]) ?? undefined,
      population: (candidate.population as UpdateCandidateInput["population"]) ?? undefined,
      setting: (candidate.setting as UpdateCandidateInput["setting"]) ?? undefined,
      telehealthPref:
        (candidate.telehealthPref as UpdateCandidateInput["telehealthPref"]) ?? undefined,
      track: candidate.track as UpdateCandidateInput["track"],
      source: (candidate.source as UpdateCandidateInput["source"]) ?? undefined,
      tags: (candidate.tags as UpdateCandidateInput["tags"]) ?? [],
      licenseState: (candidate.licenseState as UpdateCandidateInput["licenseState"]) ?? undefined,
      clientId: candidate.clientId ?? undefined,
      ...(canEditCredential ? { licenseNumber: candidate.licenseNumber ?? undefined } : {}),
    },
    submit: (values) => patchCandidate(candidate.id, values),
    onSuccess: (_data, values) => {
      onSaved(values);
      setEditing(false);
      toast.success("Candidate updated");
      announce("Candidate profile saved");
      router.refresh();
    },
    onFailure: (message) => announce(`Save failed: ${message}`),
  });

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        {/* Edit affordance intentionally removed for now (form + save path kept below —
            restoring is a one-line `setEditing(true)` trigger wherever it lands next). */}
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
              <MetaRow label="Telehealth" value={candidate.telehealthPref ?? "—"} />
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
    <form method="post" onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="cd-name" {...fieldErrorProps(form, "name")} required>
          <Input id="cd-name" {...form.register("name")} />
        </Field>
        <Field label="Email" htmlFor="cd-email" {...fieldErrorProps(form, "email")}>
          <Input
            id="cd-email"
            type="email"
            {...form.register("email", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Phone" htmlFor="cd-phone" {...fieldErrorProps(form, "phone")}>
          <Input id="cd-phone" {...form.register("phone", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="City" htmlFor="cd-city" {...fieldErrorProps(form, "city")}>
          <Input id="cd-city" {...form.register("city", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="State" htmlFor="cd-state" {...fieldErrorProps(form, "state")}>
          <Select id="cd-state" {...form.register("state", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Target Locations"
          htmlFor="cd-target-location"
          {...fieldErrorProps(form, "targetLocation")}
        >
          <Input
            id="cd-target-location"
            placeholder="Danbury CT, Stamford CT"
            {...form.register("targetLocation", { setValueAs: emptyToNull })}
          />
        </Field>
        <Field label="Employer" htmlFor="cd-employer" {...fieldErrorProps(form, "employer")}>
          <Input id="cd-employer" {...form.register("employer", { setValueAs: emptyToNull })} />
        </Field>
        <Field label="Years experience" htmlFor="cd-years" {...fieldErrorProps(form, "yearsExp")}>
          <Input
            id="cd-years"
            type="number"
            min={0}
            max={80}
            {...form.register("yearsExp", { setValueAs: emptyToNullNumber })}
          />
        </Field>
        <Field label="Credential" htmlFor="cd-cred" {...fieldErrorProps(form, "credential")}>
          <Select id="cd-cred" {...form.register("credential", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {CREDENTIALS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Population" htmlFor="cd-pop" {...fieldErrorProps(form, "population")}>
          <Select id="cd-pop" {...form.register("population", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {POPULATIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Setting" htmlFor="cd-setting" {...fieldErrorProps(form, "setting")}>
          <Select id="cd-setting" {...form.register("setting", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SETTINGS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Telehealth" htmlFor="cd-tele" {...fieldErrorProps(form, "telehealthPref")}>
          <Select id="cd-tele" {...form.register("telehealthPref", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {TELEHEALTH_PREFS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Track" htmlFor="cd-track" {...fieldErrorProps(form, "track")}>
          <Select id="cd-track" {...form.register("track")}>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" htmlFor="cd-source" {...fieldErrorProps(form, "source")}>
          <Select id="cd-source" {...form.register("source", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="License state"
          htmlFor="cd-licstate"
          {...fieldErrorProps(form, "licenseState")}
        >
          <Select id="cd-licstate" {...form.register("licenseState", { setValueAs: emptyToNull })}>
            <option value="">Select…</option>
            {US_STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Client" htmlFor="cd-client" {...fieldErrorProps(form, "clientId")}>
          <Select id="cd-client" {...form.register("clientId", { setValueAs: emptyToNull })}>
            <option value="">Unassigned</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        {canEditCredential ? (
          <Field
            label="License number"
            htmlFor="cd-licnum"
            {...fieldErrorProps(form, "licenseNumber")}
            hint="Only visible to credential-cleared roles"
          >
            <Input
              id="cd-licnum"
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
