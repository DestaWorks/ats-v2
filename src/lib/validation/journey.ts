/**
 * Candidate Journey contract — the isomorphic interface for the timeline modal (legacy
 * "CANDIDATE JOURNEY" parity). Pure types (NO server imports). The event list is composed
 * SERVER-side from stage history, role-scoped notes, outreach attempts (direct + the
 * promoted-from lead's trail), and the lead origin — oldest first, dates as ISO strings.
 */
import type { NoteType, OutreachChannel } from "@/lib/constants";

/** One timeline event. `detail` is RAW text — the client renders it as escaped React children. */
export interface JourneyEventDTO {
  kind: "sourced" | "promoted" | "created" | "stage" | "note" | "outreach";
  at: string; // ISO
  actorName: string | null;
  /** The quoted context line under the title (stage transition, note body, attempt note…). */
  detail: string | null;
  /** `note` events only — drives the label/tone. */
  noteType?: NoteType;
  /** `outreach` events only. */
  channel?: OutreachChannel;
}

/** The `GET /api/candidates/:id/journey` payload. */
export interface JourneyDTO {
  events: JourneyEventDTO[]; // oldest first
  /** Whole-journey span in days (first event → last event), for the header meta line. */
  spanDays: number;
}
