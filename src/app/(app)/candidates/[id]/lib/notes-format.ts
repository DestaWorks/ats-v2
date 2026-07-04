/**
 * Note-formatting helpers (pure, unit-tested). Presentation only — the note BODY is never touched
 * here (it's rendered as escaped React text in the component; D-3 bans HTML for note text).
 */
import type { NoteType } from "@/lib/constants";
import type { BadgeTone } from "@/components/ui/badge";

/** Badge tone for a note type: external (client-facing) reads as navy, internal as neutral. */
export function noteTypeTone(noteType: NoteType): BadgeTone {
  return noteType === "external" ? "navy" : "neutral";
}

/** Display label for a note type. */
export function noteTypeLabel(noteType: NoteType): string {
  return noteType === "external" ? "External" : "Internal";
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Compact relative time for a note/stage timestamp ("just now", "5m ago", "3h ago", "2d ago"),
 * falling back to a locale date past a week. `now` is injectable so the helper stays pure/testable.
 */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = now - then;
  if (diff < 0) return "just now";
  if (diff < MIN) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(then).toLocaleDateString();
}
