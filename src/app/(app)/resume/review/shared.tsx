"use client";

import { type ReactNode } from "react";
import {
  useFieldArray,
  type ArrayPath,
  type FieldValues,
  type Path,
  type UseFormReturn,
} from "react-hook-form";
import type { ResumeMatch } from "@/lib/validation/resume";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { confirmedCandidateIdFor } from "../lib/confirm-gate";

/** Resolve a possibly-nested react-hook-form error message by dotted path. */
export function fieldError<T extends FieldValues>(
  form: UseFormReturn<T>,
  name: Path<T>,
): string | undefined {
  let cursor: unknown = form.formState.errors;
  for (const part of (name as string).split(".")) {
    if (cursor && typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  const message = (cursor as { message?: unknown } | undefined)?.message;
  return typeof message === "string" ? message : undefined;
}

/** A profile section with the branded header rule (ports the legacy `Section`). */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5">
      <h3 className="mb-2 border-b border-navy/15 pb-1 text-[11px] font-bold tracking-[0.12em] text-navy uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** Labeled single-line text input bound to a form path. */
export function TextField<T extends FieldValues>({
  form,
  name,
  label,
  className,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  className?: string;
}) {
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={fieldError(form, name)} className={className}>
      <Input id={id} {...form.register(name)} />
    </Field>
  );
}

/** Labeled multi-line text input (snapshot, context lines). */
export function TextArea<T extends FieldValues>({
  form,
  name,
  label,
  rows = 3,
}: {
  form: UseFormReturn<T>;
  name: Path<T>;
  label: string;
  rows?: number;
}) {
  const id = `f-${name}`;
  return (
    <Field label={label} htmlFor={id} error={fieldError(form, name)}>
      <Textarea id={id} rows={rows} {...form.register(name)} className="resize-y" />
    </Field>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-1 self-start rounded-md border border-navy/30 px-2.5 py-1 text-xs font-semibold text-navy transition hover:bg-navy/5"
    >
      + {label}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="rounded-md px-2 py-1 text-xs font-medium text-red transition hover:bg-red/10"
    >
      Remove
    </button>
  );
}

/**
 * Editable list of plain strings with add/remove rows (OQ-4). Used for skills, systems,
 * publications, board certs, and experience bullets. `name` is a `string[]` array path.
 */
export function StringListEditor<T extends FieldValues>({
  form,
  name,
  label,
  addLabel,
  placeholder,
}: {
  form: UseFormReturn<T>;
  /** A `string[]` field path. Typed as `string` because RHF's `ArrayPath` excludes primitive arrays. */
  name: string;
  label: string;
  addLabel: string;
  placeholder?: string;
}) {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: name as ArrayPath<T>,
  });
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium text-charcoal">{label}</legend>
      {fields.map((field, index) => (
        <div key={field.id} className="flex items-center gap-2">
          <Input {...form.register(`${name}.${index}` as Path<T>)} placeholder={placeholder} />
          <RemoveButton label={`Remove ${label} item ${index + 1}`} onClick={() => remove(index)} />
        </div>
      ))}
      <AddButton label={addLabel} onClick={() => append("" as never)} />
    </fieldset>
  );
}

/**
 * The résumé → candidate match + confirm gate + Save button (design §7), announced via
 * `role="status"`. `auto` pre-selects the attach toggle; `confirm` requires an explicit tick;
 * `none` always creates a new candidate. Returns the chosen `confirmedCandidateId` through
 * `onSubmit` — never sent unless the user's choice permits it (see `confirm-gate.ts`).
 */
export function SaveBar({
  match,
  submitting,
  confirmed,
  onConfirmChange,
}: {
  match: ResumeMatch;
  submitting: boolean;
  /** Controlled attach choice (owned by the layout so it can compute `confirmedCandidateId`). */
  confirmed: boolean;
  onConfirmChange: (confirmed: boolean) => void;
}) {
  return (
    <div className="mt-6 flex flex-col gap-3 rounded-xl border border-black/10 bg-ivory p-4">
      <div role="status" className="text-sm text-charcoal">
        {match.status === "auto" ? (
          <>
            <strong className="text-navy">{match.candidateName}</strong> is already in the pipeline
            (email match) — this résumé will be attached to them.
          </>
        ) : match.status === "confirm" ? (
          <>
            A possible match: <strong className="text-navy">{match.candidateName}</strong>. Confirm
            it&apos;s the same person before attaching.
          </>
        ) : (
          <>No existing candidate matched — a new candidate will be created.</>
        )}
      </div>

      {/* Email-exact (`auto`) is a dedupe key — always attaches, no decline toggle. Only the
          fuzzy `confirm` match needs an explicit tick. */}
      {match.status === "confirm" ? (
        <label className="flex items-center gap-2 text-sm text-charcoal">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => onConfirmChange(event.target.checked)}
            className="h-4 w-4 rounded border-black/30 text-navy focus:ring-2 focus:ring-navy"
          />
          This is the same person
        </label>
      ) : null}

      <Button type="submit" variant="success" size="lg" loading={submitting} className="self-start">
        {submitting
          ? "Saving…"
          : match.status === "auto" || (match.status === "confirm" && confirmed)
            ? "Attach & Save"
            : "Save as New Candidate"}
      </Button>
    </div>
  );
}

/** Derive the `confirmedCandidateId` for a save request from the current match + choice. */
export function attachIdFor(match: ResumeMatch, confirmed: boolean): string | undefined {
  return confirmedCandidateIdFor(match, confirmed);
}
