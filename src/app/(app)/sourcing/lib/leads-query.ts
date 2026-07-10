/**
 * Pure, isomorphic helper for the `/sourcing` inventory's client concerns — no React, no server
 * imports, so it unit-tests in isolation (Vitest node). One job: derive the per-row
 * action-enabled state from the lead's status by composing the server-authoritative
 * `lead-lifecycle` rules (`leadActionState`) so the UI disables exactly the actions the service
 * would reject. (The list read needs no query builder anymore — the RSC serves offset pages
 * straight from `?page=` navigations.)
 */
import type { LeadStatus } from "@/lib/constants";
import { canLogOutreach, canPromote, canRespond } from "@/lib/rules/lead-lifecycle";

/** Which row actions are legal for a lead in `status` — a Promoted lead is terminal (all off). */
export interface LeadActionState {
  canLogOutreach: boolean;
  canRespond: boolean;
  canPromote: boolean;
}

/** Compose the pure lifecycle gates into the UI's per-row enabled state (single source of truth). */
export function leadActionState(status: LeadStatus): LeadActionState {
  return {
    canLogOutreach: canLogOutreach(status),
    canRespond: canRespond(status),
    canPromote: canPromote(status),
  };
}
