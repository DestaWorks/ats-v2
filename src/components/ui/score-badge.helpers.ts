import { HOT_SCORE } from "@/lib/constants";
import type { BadgeTone } from "./badge";

/**
 * Pure color/hot logic for the fit score, extracted so it can be unit-tested without a DOM
 * (vitest is node-only here) and so the color scale lives in ONE place.
 */

/**
 * Color band for a candidate's fit score (a `pct`, or `null`):
 * `≥ HOT_SCORE → success` (green) · `50–79 → amber` · `< 50 → neutral` · `null → neutral` (muted).
 * The green band tracks the tunable `HOT_SCORE` so "green" and "hot" never desync.
 */
export function scoreTone(score: number | null): BadgeTone {
  if (score === null) return "neutral";
  if (score >= HOT_SCORE) return "success";
  if (score >= 50) return "amber";
  return "neutral";
}

/** A candidate is "hot" when it has a score at or above the shared `HOT_SCORE` threshold. */
export function isHot(score: number | null): boolean {
  return score !== null && score >= HOT_SCORE;
}
