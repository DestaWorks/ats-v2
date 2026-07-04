"use client";

import { PrescriberResumeSchema, type PrescriberResume } from "@/lib/validation/resume";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { useFieldArray, type Path } from "react-hook-form";
import { Section, TextField } from "./shared";
import { Input } from "@/components/ui/input";
import {
  EducationSection,
  ExperienceSection,
  IdentitySection,
  LicensureSection,
  ProfileForm,
  SnapshotSection,
  StringListEditor,
  VerificationSection,
  type LayoutProps,
} from "./common-sections";
import type { UseFormReturn } from "react-hook-form";

const emptyDea = { state: "", number: "" };
const emptyAffiliation = { name: "", role: "", location: "", dates: "" };

/** DEA registrations (per-state) — editable add/remove rows. */
function DeaEditor({ form }: { form: UseFormReturn<PrescriberResume> }) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "dea" });
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-charcoal">DEA registrations</legend>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input
            {...form.register(`dea.${index}.state` as Path<PrescriberResume>)}
            placeholder="State"
          />
          <Input
            {...form.register(`dea.${index}.number` as Path<PrescriberResume>)}
            placeholder="Number"
          />
          <button
            type="button"
            onClick={() => remove(index)}
            aria-label={`Remove DEA row ${index + 1}`}
            className="rounded-md px-2 py-1 text-xs font-medium text-red transition hover:bg-red/10"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => append(emptyDea)}
        className="self-start rounded-md border border-navy/30 px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-navy/5"
      >
        + Add DEA
      </button>
    </fieldset>
  );
}

/** Hospital affiliations — editable add/remove rows. */
function AffiliationsEditor({ form }: { form: UseFormReturn<PrescriberResume> }) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "hospitalAffiliations",
  });
  return (
    <Section title="Hospital Affiliations">
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-end gap-2 rounded-lg border border-black/10 p-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]"
          >
            <TextField
              form={form}
              name={`hospitalAffiliations.${index}.name` as Path<PrescriberResume>}
              label="Name"
            />
            <TextField
              form={form}
              name={`hospitalAffiliations.${index}.role` as Path<PrescriberResume>}
              label="Role"
            />
            <TextField
              form={form}
              name={`hospitalAffiliations.${index}.location` as Path<PrescriberResume>}
              label="Location"
            />
            <TextField
              form={form}
              name={`hospitalAffiliations.${index}.dates` as Path<PrescriberResume>}
              label="Dates"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove affiliation ${index + 1}`}
              className="rounded-md px-2 py-2 text-xs font-medium text-red transition hover:bg-red/10"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => append(emptyAffiliation)}
          className="self-start rounded-md border border-navy/30 px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-navy/5"
        >
          + Add affiliation
        </button>
      </div>
    </Section>
  );
}

/** Prescriber profile — adds board certs, DEA, hospital affiliations, publications. */
export function PrescriberLayout({
  data,
  match,
  submitting,
  onSave,
}: LayoutProps<PrescriberResume>) {
  const form = useZodForm(PrescriberResumeSchema, { defaultValues: data });
  return (
    <ProfileForm form={form} match={match} submitting={submitting} onSave={onSave}>
      <IdentitySection form={form} />
      <SnapshotSection form={form} />
      <LicensureSection form={form} />
      <Section title="NPI, DEA & CAQH">
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField form={form} name="npi" label="NPI" />
            <TextField form={form} name="caqhAttestedDate" label="CAQH attested date" />
          </div>
          <DeaEditor form={form} />
        </div>
      </Section>
      <Section title="Board Certifications">
        <StringListEditor
          form={form}
          name="boardCertifications"
          label="Board certifications"
          addLabel="Add certification"
        />
      </Section>
      <Section title="Skills & Specialties">
        <div className="flex flex-col gap-4">
          <StringListEditor
            form={form}
            name="skills.modalities"
            label="Modalities"
            addLabel="Add modality"
          />
          <StringListEditor
            form={form}
            name="skills.populations"
            label="Populations"
            addLabel="Add population"
          />
        </div>
      </Section>
      <AffiliationsEditor form={form} />
      <ExperienceSection form={form} />
      <EducationSection form={form} />
      <Section title="Publications & Presentations">
        <StringListEditor
          form={form}
          name="publications"
          label="Publications"
          addLabel="Add publication"
        />
      </Section>
      <VerificationSection form={form} />
    </ProfileForm>
  );
}
