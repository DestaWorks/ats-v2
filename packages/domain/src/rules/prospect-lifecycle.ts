/**
 * Client Discovery prospect state guards — mirrors `lead-lifecycle.ts`'s idiom: PURE + ISOMORPHIC
 * (no `server-only`), unit-tested in isolation and reused by the client to disable dead actions.
 * `prospect.service.ts` is the SOLE writer — this module only answers "is this legal", it never
 * reasons about `deletedAt` (that is the service's row-level guard).
 *
 * Unlike a SourceLead's outreach-count-driven auto-advance, a Prospect's status is a manual
 * dropdown/kanban move (Fresh Lead → Researched → Contacted → Qualified → Client / Not a Fit).
 * Only `Client` is truly terminal (the prospect converted — matches SourceLead's `Promoted`);
 * `Not a Fit` can still be reconsidered later, same as a lead's closed-but-still-chaseable states.
 */
import type { ProspectStatus } from "../constants";

/** Editing (status/notes/owner) is legal unless the prospect has already converted (terminal). */
export function canEditProspect(status: ProspectStatus): boolean {
  return status !== "Client";
}

/** Adding/enriching contacts is legal unless the prospect has already converted. */
export function canManageContacts(status: ProspectStatus): boolean {
  return status !== "Client";
}
