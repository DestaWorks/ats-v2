"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NOTE_TYPES, type NoteType } from "@/lib/constants";
import { mentionToken, splitMentions, type MentionTarget } from "@/lib/mentions";
import { addNoteSchema, type NoteDTO } from "@/lib/validation/candidate";
import { useApiForm } from "@/lib/forms/use-api-form";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldError } from "./lib/form-error";
import { Textarea } from "@/components/ui/textarea";
import { formatRelativeTime, noteTypeLabel, noteTypeTone } from "./lib/notes-format";
import { postNote } from "./lib/detail-fetch";

/** The open @autocomplete: where the token starts and what's typed after the `@`. */
interface MentionDropdown {
  start: number;
  filter: string;
}

const MENTION_SUGGESTIONS_MAX = 8;

/**
 * Notes surface. D-3 (BINDING): the note body is rendered as ESCAPED PLAIN TEXT via React
 * children — `dangerouslySetInnerHTML` is NEVER used here. This is the fix for the legacy
 * stored-XSS (which injected `@mention` HTML into `dangerouslySetInnerHTML`); mentions are
 * highlighted by SPLITTING the text into runs (`splitMentions`) and styling the `@token` runs
 * as React elements. Whitespace/newlines are preserved with CSS (`whitespace-pre-wrap`).
 *
 * The @autocomplete is cursor-aware (legacy parity): typing `@` opens a picker filtered by the
 * token after it; Enter/Tab inserts, arrows navigate, Escape closes. Who gets NOTIFIED is decided
 * server-side by re-parsing the stored body — this picker is a typing aid, not the authority.
 */
export function NotesTab({
  candidateId,
  notes,
  taggable,
  onAdded,
  announce,
}: {
  candidateId: string;
  notes: NoteDTO[];
  taggable: MentionTarget[];
  onAdded: (note: NoteDTO) => void;
  announce: (message: string) => void;
}) {
  const router = useRouter();
  const [dropdown, setDropdown] = useState<MentionDropdown | null>(null);
  const [selected, setSelected] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { form, pending, onSubmit } = useApiForm(addNoteSchema, {
    defaultValues: { body: "", noteType: "internal" },
    submit: (values) => postNote(candidateId, values),
    onSuccess: (note, values) => {
      onAdded(note);
      form.reset({ body: "", noteType: values.noteType });
      setDropdown(null);
      toast.success("Note added");
      announce("Note added");
      router.refresh();
    },
    onFailure: (message) => announce(`Couldn't add note: ${message}`),
  });
  const noteType = form.watch("noteType");
  const bodyField = form.register("body");

  const suggestions = dropdown
    ? taggable
        .filter((u) => u.name.toLowerCase().includes(dropdown.filter.toLowerCase()))
        .slice(0, MENTION_SUGGESTIONS_MAX)
    : [];

  /** Legacy-parity trigger: the last `@` before the cursor opens the picker unless whitespace follows it. */
  function trackMention(target: HTMLTextAreaElement) {
    const cursor = target.selectionStart ?? target.value.length;
    const beforeCursor = target.value.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf("@");
    if (atIndex < 0) return setDropdown(null);
    const token = beforeCursor.slice(atIndex + 1);
    if (/\s/.test(token)) return setDropdown(null);
    setDropdown({ start: atIndex, filter: token });
    setSelected(0);
  }

  /** Replace the open `@token` with the picked user's mention token + a trailing space. */
  function insertMention(user: MentionTarget) {
    const textarea = textareaRef.current;
    if (!textarea || !dropdown) return;
    const cursor = textarea.selectionStart ?? textarea.value.length;
    const token = `@${mentionToken(user, taggable)} `;
    const next = textarea.value.slice(0, dropdown.start) + token + textarea.value.slice(cursor);
    form.setValue("body", next, { shouldValidate: false });
    setDropdown(null);
    const caret = dropdown.start + token.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(caret, caret);
    });
  }

  function onBodyKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!dropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => (s + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => (s - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(suggestions[selected]!);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDropdown(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-3 rounded-xl border border-black/5 bg-white p-4"
      >
        <fieldset className="flex flex-wrap items-center gap-2">
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

        <div className="relative">
          <Field label="Add a note" htmlFor="note-body" error={fieldError(form, "body")}>
            <Textarea
              id="note-body"
              rows={3}
              className="resize-y"
              placeholder="Write a note… type @ to mention a teammate"
              {...bodyField}
              ref={(el) => {
                bodyField.ref(el);
                textareaRef.current = el;
              }}
              onChange={(e) => {
                void bodyField.onChange(e);
                trackMention(e.target);
              }}
              onKeyDown={onBodyKeyDown}
              onBlur={(e) => {
                void bodyField.onBlur(e);
                // Delay so a mousedown on a suggestion still lands before the list unmounts.
                setTimeout(() => setDropdown(null), 150);
              }}
            />
          </Field>

          {dropdown && suggestions.length > 0 ? (
            <ul
              role="listbox"
              aria-label="Mention a teammate"
              className="absolute right-0 left-0 z-10 mt-1 max-h-56 overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
            >
              {suggestions.map((user, i) => (
                <li key={user.id} role="option" aria-selected={i === selected}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // keep textarea focus
                      insertMention(user);
                    }}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm text-charcoal",
                      i === selected && "bg-navy/10",
                    )}
                  >
                    <span className="font-medium">@{mentionToken(user, taggable)}</span>
                    <span className="ml-2 text-xs text-gray">{user.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

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
              {/* D-3: escaped React text — NEVER dangerouslySetInnerHTML. Mentions are styled by
                  splitting into runs, not by injecting markup. */}
              <p className="text-sm whitespace-pre-wrap text-charcoal">
                {splitMentions(note.body).map((seg, i) =>
                  seg.mention ? (
                    <strong key={i} className="font-semibold text-navy">
                      {seg.text}
                    </strong>
                  ) : (
                    <span key={i}>{seg.text}</span>
                  ),
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
