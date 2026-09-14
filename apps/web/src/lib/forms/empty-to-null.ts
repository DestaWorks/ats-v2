/**
 * `react-hook-form` `setValueAs` transforms for optional fields — an empty string (the natural
 * "cleared" state of a text/select input) should register as `null` (the API's "unset" value),
 * not `""`. Was redefined identically in 6 form files; shared here instead.
 */

/** Empty-string sentinel → `null` for optional text/select fields. */
export function emptyToNull(v: unknown): unknown {
  return v === "" || v == null ? null : v;
}

/** Empty-string sentinel → `null` for optional NUMERIC fields; a non-numeric value also → `null`. */
export function emptyToNullNumber(v: unknown): number | null {
  return v === "" || v == null || Number.isNaN(Number(v)) ? null : Number(v);
}

/**
 * Empty-string sentinel → `undefined`, for fields the contract declares `.optional()` rather than
 * `.nullable()`. A `.strict()` object REFUSES an explicit `null` there, so a blank optional input
 * has to disappear from the payload rather than arrive as one — which is what `JSON.stringify`
 * does with `undefined`.
 */
export function emptyToUndefined(v: unknown): unknown {
  return v === "" || v == null ? undefined : v;
}
