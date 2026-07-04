"use client";

import { useState, type ReactNode } from "react";
import {
  useFieldArray,
  type ArrayPath,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import type { ResumeData, ResumeMatch } from "@/lib/validation/resume";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { defaultConfirmed } from "../lib/confirm-gate";
import { attachIdFor, SaveBar, Section, StringListEditor, TextArea, TextField } from "./shared";

/**
 * Shared, variant-agnostic editors for the fields present on every résumé variant
 * (ports the legacy render helpers: name block, snapshot, experience, education,
 * verification line). Generic over the concrete form so `useFieldArray` stays typed.
 */

/** What a layout hands back on Save: the validated résumé + the (gated) attach target. */
export type SaveHandler = (
  data: ResumeData,
  confirmedCandidateId: string | undefined,
) => void | Promise<void>;

/** Common props every variant layout receives from the flow. */
export interface LayoutProps<T> {
  data: T;
  match: ResumeMatch;
  submitting: boolean;
  onSave: SaveHandler;
}

/**
 * Form scaffolding shared by all three layouts: the white profile card (brand header +
 * sections) and the match/confirm/Save bar. Owns the attach-choice state and computes the
 * gated `confirmedCandidateId` at submit time via `attachIdFor`.
 */
export function ProfileForm<T extends FieldValues>({
  form,
  match,
  submitting,
  onSave,
  children,
}: {
  form: UseFormReturn<T>;
  match: ResumeMatch;
  submitting: boolean;
  onSave: SaveHandler;
  children: ReactNode;
}) {
  const [confirmed, setConfirmed] = useState(() => defaultConfirmed(match));
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) =>
        onSave(values as unknown as ResumeData, attachIdFor(match, confirmed)),
      )}
      className="flex flex-col"
    >
      <div className="rounded-xl border border-black/10 bg-white p-6 shadow-sm print:border-0 print:shadow-none">
        <BrandHeader />
        {children}
      </div>
      <SaveBar
        match={match}
        submitting={submitting}
        confirmed={confirmed}
        onConfirmChange={setConfirmed}
      />
    </form>
  );
}

/** Brand header — the fixed DestaHealth banner shown atop every rendered profile. */
export function BrandHeader() {
  return (
    <div className="mb-4 flex items-end justify-between border-b-2 border-navy pb-2">
      <div className="flex items-baseline">
        <span className="text-2xl font-extrabold tracking-tight text-navy">Desta</span>
        <span className="text-2xl font-light tracking-tight text-navy">Health</span>
      </div>
      <span className="text-[10px] font-bold tracking-[0.2em] text-navy">CANDIDATE PROFILE</span>
    </div>
  );
}

/** Identity + contact + home base (the legacy name block). */
export function IdentitySection<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  return (
    <Section title="Candidate">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField form={form} name={"name" as Path<T>} label="Name" />
        <TextField form={form} name={"headerRole" as Path<T>} label="Header role" />
        <TextField form={form} name={"email" as Path<T>} label="Email" />
        <TextField form={form} name={"phone" as Path<T>} label="Phone" />
        <TextField form={form} name={"homeBase.city" as Path<T>} label="City" />
        <TextField
          form={form}
          name={"homeBase.stateOrCountry" as Path<T>}
          label="State / Country"
        />
        <TextField form={form} name={"homeBase.timezone" as Path<T>} label="Timezone" />
        <TextField form={form} name={"workMode" as Path<T>} label="Work mode" />
        <TextField form={form} name={"targetStart" as Path<T>} label="Target start" />
      </div>
    </Section>
  );
}

/** Sales-grade summary paragraph. */
export function SnapshotSection<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  return (
    <Section title="Snapshot">
      <TextArea form={form} name={"snapshot" as Path<T>} label="Snapshot" rows={4} />
    </Section>
  );
}

/** SOURCES-to-check line (never a "verified" claim — design §4.4). */
export function VerificationSection<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  return (
    <TextField
      form={form}
      name={"verificationLine" as Path<T>}
      label="Verification line (sources to check)"
      className="mt-3"
    />
  );
}

/** Nested bullets editor for one experience row (add/remove bullets — OQ-4). */
function BulletsEditor<T extends FieldValues>({
  form,
  index,
}: {
  form: UseFormReturn<T>;
  index: number;
}) {
  const name = `experience.${index}.bullets` as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <span className="text-xs font-medium text-gray">Bullets</span>
      {fields.map((field, bulletIndex) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input {...form.register(`experience.${index}.bullets.${bulletIndex}` as Path<T>)} />
          <button
            type="button"
            onClick={() => remove(bulletIndex)}
            aria-label={`Remove bullet ${bulletIndex + 1}`}
            className="rounded-md px-2 py-1 text-xs font-medium text-red transition hover:bg-red/10"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => append("" as never)}
        className="self-start rounded-md border border-navy/30 px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-navy/5"
      >
        + Add bullet
      </button>
    </div>
  );
}

const emptyExperience = {
  title: "",
  dates: "",
  employer: "",
  setting: "",
  location: "",
  contextLine: "",
  bullets: [],
};

/** Experience field array with add/remove rows. */
export function ExperienceSection<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const name = "experience" as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  return (
    <Section title="Experience">
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded-lg border border-black/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-gray">Role {index + 1}</p>
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red transition hover:bg-red/10"
              >
                Remove role
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <TextField form={form} name={`experience.${index}.title` as Path<T>} label="Title" />
              <TextField form={form} name={`experience.${index}.dates` as Path<T>} label="Dates" />
              <TextField
                form={form}
                name={`experience.${index}.employer` as Path<T>}
                label="Employer"
              />
              <TextField
                form={form}
                name={`experience.${index}.setting` as Path<T>}
                label="Setting"
              />
              <TextField
                form={form}
                name={`experience.${index}.location` as Path<T>}
                label="Location"
              />
              <TextField
                form={form}
                name={`experience.${index}.contextLine` as Path<T>}
                label="Context line"
              />
            </div>
            <BulletsEditor form={form} index={index} />
          </div>
        ))}
        <button
          type="button"
          onClick={() => append(emptyExperience as never)}
          className={cn(
            "self-start rounded-md border border-navy/30 px-3 py-1.5 text-xs font-semibold text-navy",
            "transition hover:bg-navy/5",
          )}
        >
          + Add role
        </button>
      </div>
    </Section>
  );
}

const emptyEducation = { degree: "", school: "", location: "", year: "", honor: "" };

/** Education field array with add/remove rows. */
export function EducationSection<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const name = "education" as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  return (
    <Section title="Education & Training">
      <div className="flex flex-col gap-4">
        {fields.map((field, index) => (
          <div key={field.id} className="rounded-lg border border-black/10 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-gray">Entry {index + 1}</p>
              <button
                type="button"
                onClick={() => remove(index)}
                className="rounded-md px-2 py-1 text-xs font-medium text-red transition hover:bg-red/10"
              >
                Remove
              </button>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <TextField form={form} name={`education.${index}.degree` as Path<T>} label="Degree" />
              <TextField form={form} name={`education.${index}.school` as Path<T>} label="School" />
              <TextField
                form={form}
                name={`education.${index}.location` as Path<T>}
                label="Location"
              />
              <TextField form={form} name={`education.${index}.year` as Path<T>} label="Year" />
              <TextField form={form} name={`education.${index}.honor` as Path<T>} label="Honor" />
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => append(emptyEducation as never)}
          className="self-start rounded-md border border-navy/30 px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-navy/5"
        >
          + Add education
        </button>
      </div>
    </Section>
  );
}

const emptyLicensure = { type: "", state: "", number: "", status: "", expires: "" };

/** Licensure field array (clinical + prescriber) with add/remove rows. */
export function LicensureSection<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  const name = "licensure" as ArrayPath<T>;
  const { fields, append, remove } = useFieldArray({ control: form.control, name });
  return (
    <Section title="Licensure & Credentials">
      <div className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className="grid items-end gap-2 rounded-lg border border-black/10 p-3 sm:grid-cols-[1.4fr_0.7fr_1fr_1fr_1fr_auto]"
          >
            <TextField form={form} name={`licensure.${index}.type` as Path<T>} label="Type" />
            <TextField form={form} name={`licensure.${index}.state` as Path<T>} label="State" />
            <TextField form={form} name={`licensure.${index}.number` as Path<T>} label="Number" />
            <TextField form={form} name={`licensure.${index}.status` as Path<T>} label="Status" />
            <TextField form={form} name={`licensure.${index}.expires` as Path<T>} label="Expires" />
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove licensure row ${index + 1}`}
              className="rounded-md px-2 py-2 text-xs font-medium text-red transition hover:bg-red/10"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => append(emptyLicensure as never)}
          className="self-start rounded-md border border-navy/30 px-3 py-1.5 text-xs font-semibold text-navy transition hover:bg-navy/5"
        >
          + Add licensure
        </button>
      </div>
    </Section>
  );
}

/** Re-export so layouts import array editors from one place. */
export { StringListEditor };
