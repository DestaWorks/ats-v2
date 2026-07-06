/**
 * Pure, isomorphic helpers for the `/sourcing` inventory's client concerns — no React, no server
 * imports, so they unit-test in isolation (Vitest node). Two jobs: assemble the load-more query
 * string from the current URL filters (`buildLeadsQuery`), and derive the per-row action-enabled
 * state from the lead's status by composing the server-authoritative `lead-lifecycle` rules
 * (`leadActionState`) so the UI disables exactly the actions the service would reject.
 */
import type { LeadStatus } from "@/lib/constants";
import { canLogOutreach, canPromote, canRespond } from "@/lib/rules/lead-lifecycle";

/** The server-backed filters carried into a load-more request (mirrors `leadListQuerySchema`). */
export const LEAD_SERVER_PARAMS = ["status", "source", "search", "deleted"] as const;

/**
 * Assemble the load-more query string for `GET /api/leads/list` — carries the current URL filters
 * (status/source/search) plus the opaque keyset `cursor`. Returns a bare query string (no leading
 * `?`); empty/absent values are dropped so the wire query stays minimal.
 */
export function buildLeadsQuery(searchParams: URLSearchParams, cursor: string | null): string {
  const out = new URLSearchParams();
  for (const key of LEAD_SERVER_PARAMS) {
    const value = searchParams.get(key);
    if (value) out.set(key, value);
  }
  if (cursor) out.set("cursor", cursor);
  return out.toString();
}

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
