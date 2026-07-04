"use client";

import { ClinicalResumeSchema, type ClinicalResume } from "@/lib/validation/resume";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { Section, TextField } from "./shared";
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

/** Clinical résumé profile — licensure + NPI/CAQH + modalities/populations (no DEA/board certs). */
export function ClinicalLayout({ data, match, submitting, onSave }: LayoutProps<ClinicalResume>) {
  const form = useZodForm(ClinicalResumeSchema, { defaultValues: data });
  return (
    <ProfileForm form={form} match={match} submitting={submitting} onSave={onSave}>
      <IdentitySection form={form} />
      <SnapshotSection form={form} />
      <LicensureSection form={form} />
      <Section title="NPI & CAQH">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField form={form} name="npi" label="NPI" />
          <TextField form={form} name="caqhAttestedDate" label="CAQH attested date" />
        </div>
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
      <ExperienceSection form={form} />
      <EducationSection form={form} />
      <VerificationSection form={form} />
    </ProfileForm>
  );
}
