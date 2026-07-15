/**
 * Saved-view scopes (Wave 2.1 closeout) — discriminates pages with incompatible URL param sets
 * (pipeline board vs. candidates list) so a saved view is only ever offered/applied on the page
 * it was captured from.
 */

export const SAVED_VIEW_SCOPES = ["pipeline", "candidates"] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];
