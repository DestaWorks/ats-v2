"use client";

import { OperationsResumeSchema, type OperationsResume } from "@/lib/validation/resume";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { Section, TextField } from "./shared";
import {
  EducationSection,
  ExperienceSection,
  IdentitySection,
  ProfileForm,
  SnapshotSection,
  StringListEditor,
  VerificationSection,
  type LayoutProps,
} from "./common-sections";

/** Operations profile — no licensure/NPI/DEA; systems/tools, coverage hours, English level. */
export function OperationsLayout({
  data,
  match,
  submitting,
  onSave,
}: LayoutProps<OperationsResume>) {
  const form = useZodForm(OperationsResumeSchema, { defaultValues: data });
  return (
    <ProfileForm form={form} match={match} submitting={submitting} onSave={onSave}>
      <IdentitySection form={form} />
      <SnapshotSection form={form} />
      <Section title="Availability & Language">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField form={form} name="coverageHours" label="Coverage hours" />
          <TextField form={form} name="englishLevel" label="English level" />
          <TextField form={form} name="referencesStatus" label="References status" />
        </div>
      </Section>
      <Section title="Systems & Tools">
        <StringListEditor
          form={form}
          name="systemsTools"
          label="Systems &amp; tools"
          addLabel="Add system"
        />
      </Section>
      <Section title="Skills & Specialties">
        <StringListEditor
          form={form}
          name="skills.functional"
          label="Functional skills"
          addLabel="Add skill"
        />
      </Section>
      <ExperienceSection form={form} />
      <EducationSection form={form} />
      <VerificationSection form={form} />
    </ProfileForm>
  );
}
