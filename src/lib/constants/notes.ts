/**
 * Candidate-note vocabulary (Wave 2.2). Two-value type (collapsed from the legacy 5-way
 * call/email/text/client/internal): everything internal-team-authored is `internal`; a
 * client-facing note is `external`. Stored as a String on `candidate_notes.noteType` and
 * validated against this union in zod (matches the credential/status vocab pattern).
 */

export const NOTE_TYPES = ["internal", "external"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

export function isNoteType(v: string): v is NoteType {
  return (NOTE_TYPES as readonly string[]).includes(v);
}
