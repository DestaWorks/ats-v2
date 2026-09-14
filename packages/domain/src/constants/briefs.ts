/**
 * Wave 5.1 (Briefs) — the voice/style instruction shared by every brief-generation prompt
 * (Daily Brief, Weekly Brief, Weekly Patterns, target suggestions). Ported VERBATIM from legacy
 * `Code.gs`'s brief prompts — this is a real product-voice requirement (Biruh's), not incidental
 * copy, so it is defined once here rather than re-typed per prompt.
 */
export const BRIEF_VOICE_INSTRUCTION =
  "Write in the voice of Biruh Mezgebu: direct, noun-heavy, action-closing. Never use align, " +
  "finalize, circle back, synergy, touch base, handle, or move forward. Lead with reality, then " +
  "constraint, then next action. End each bullet or statement on the sharpest noun.";

/** Rows shown per per-associate/client card before a "show more" — legacy's own cap. */
export const BRIEF_CLIENT_CARD_LIMIT = 3;
export const BRIEF_STUCK_CANDIDATE_LIMIT = 8;
