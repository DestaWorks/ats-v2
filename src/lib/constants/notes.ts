/**
 * Candidate-note vocabulary. The legacy 5-way type set, restored verbatim in the 2026-07-07 parity
 * audit (the interim 2-value internal/external collapse hid the call/email/text logging the team
 * uses daily). Stored as a String on `candidate_notes.noteType` and validated against this union
 * in zod (matches the credential/status vocab pattern).
 *
 * VISIBILITY (server-authoritative, `visibleNotes`): `internal` is readable by every operator;
 * the other four types require the `viewAllNoteTypes` capability (legacy: literal `admin` role
 * only — hidden CLIENT-SIDE, the bug the rebuild fixes). Everyone may WRITE any type (legacy
 * parity: the type picker had no role gate).
 */

export const NOTE_TYPES = ["internal", "client", "call", "email", "text"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export function isNoteType(v: string): v is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(v);
}

/** Display labels (legacy picker: Note / Client Note / Call Log / Email Log / Text Log). */
export const NOTE_TYPE_LABELS: Record<NoteType, string> = {
  internal: "Note",
  client: "Client note",
  call: "Call log",
  email: "Email log",
  text: "Text log",
};
