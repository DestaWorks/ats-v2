"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NOTE_TYPES, type NoteType } from "@/lib/constants";
import { addNoteSchema, type AddNoteInput, type NoteDTO } from "@/lib/validation/candidate";
import { useZodForm } from "@/lib/forms/use-zod-form";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldError } from "./lib/form-error";
import { inputClass } from "./lib/field-styles";
import { formatRelativeTime, noteTypeLabel, noteTypeTone } from "./lib/notes-format";
import { messageForFailure, postNote } from "./lib/detail-fetch";

/**
 * Notes surface. D-3 (BINDING): the note body is rendered as ESCAPED PLAIN TEXT via React children
 * (`{note.body}`) — `dangerouslySetInnerHTML` is NEVER used here. This is the fix for the legacy
 * stored-XSS (which injected `@mention` HTML into `dangerouslySetInnerHTML`). Whitespace/newlines
 * are preserved with CSS (`whitespace-pre-wrap`), not `<br>`.
 */
export function NotesTab({
  candidateId,
  notes,
  onAdded,
  announce,
}: {
  candidateId: string;
  notes: NoteDTO[];
  onAdded: (note: NoteDTO) => void;
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const form = useZodForm(addNoteSchema, {
    defaultValues: { body: "", noteType: "internal" },
  });
  const noteType = form.watch("noteType");

  function onSubmit(values: AddNoteInput) {
    startTransition(async () => {
      const result = await postNote(candidateId, values);
      if (result.ok) {
        onAdded(result.data);
        form.reset({ body: "", noteType: values.noteType });
        toast.success("Note added");
        announce("Note added");
        router.refresh();
      } else if (result.failure.issues.length) {
        for (const issue of result.failure.issues) {
          form.setError(issue.path as keyof AddNoteInput, { message: issue.message });
        }
      } else {
        toast.error(messageForFailure(result.failure));
        announce(`Couldn't add note: ${messageForFailure(result.failure)}`);
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        noValidate
        className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white p-4"
      >
        <fieldset className="flex items-center gap-2">
          <legend className="sr-only">Note type</legend>
          {NOTE_TYPES.map((type: NoteType) => {
            const active = noteType === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => form.setValue("noteType", type)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition",
                  active
                    ? "bg-navy text-white"
                    : "border border-black/15 text-charcoal hover:bg-black/5",
                )}
              >
                {noteTypeLabel(type)}
              </button>
            );
          })}
        </fieldset>

        <Field label="Add a note" htmlFor="note-body" error={fieldError(form, "body")}>
          <textarea
            id="note-body"
            rows={3}
            className={cn(inputClass, "resize-y")}
            placeholder="Write an internal or client-facing note…"
            {...form.register("body")}
          />
        </Field>

        <div className="flex justify-end">
          <Button type="submit" size="sm" loading={pending}>
            Add note
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" description="Add the first note above." />
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => (
            <li key={note.id} className="rounded-xl border border-black/5 bg-white p-4">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-charcoal">
                    {note.authorName ?? "—"}
                  </span>
                  <Badge tone={noteTypeTone(note.noteType)} size="sm">
                    {noteTypeLabel(note.noteType)}
                  </Badge>
                </div>
                <time dateTime={note.createdAt} className="text-xs text-gray">
                  {formatRelativeTime(note.createdAt)}
                </time>
              </div>
              {/* D-3: escaped React text — NEVER dangerouslySetInnerHTML. */}
              <p className="text-sm whitespace-pre-wrap text-charcoal">{note.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
