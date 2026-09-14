/**
 * Display tone vocabulary — the tinted colour pairs a status can be rendered in.
 *
 * Lives here rather than beside the `Badge` component because domain constants
 * (lead status, prospect status, audit action) map their values to a tone, and
 * `lib/` must not depend on `components/`. `Badge` imports this and owns the
 * tone → Tailwind class mapping; this module owns only the vocabulary.
 */

export const BADGE_TONES = ["neutral", "navy", "success", "amber", "danger", "purple"] as const;

export type BadgeTone = (typeof BADGE_TONES)[number];
