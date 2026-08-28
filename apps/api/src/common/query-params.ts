/** One query string reduced to what `URLSearchParams.get()` answers for each key it carries. */
export type FlatQuery = Readonly<Record<string, string | undefined>>;

/**
 * Normalises Express's parsed query object to what `URLSearchParams.get()` would have returned for
 * the same URL, so a controller validates the SAME value its App Router counterpart validated.
 *
 * The two parsers disagree on repeated and bracketed keys. `?search=a&search=b` reaches a Next.js
 * route as `"a"` (the first value) but reaches Express as `["a", "b"]`, and `?a[b]=c` reaches
 * Express as a nested object. Handed straight to a contract schema those become a 422 where the
 * route answered 200 — a parity break invisible to any test that only sends well-formed queries.
 *
 * Nothing is filtered out: every contract query schema is a plain `z.object()`, which STRIPS
 * unknown keys, so passing the whole normalised object through is what makes an unrecognised
 * parameter ignored on both sides rather than rejected on one.
 *
 * Shaped as a NestJS pipe so it composes in front of `ZodValidationPipe` — `@Query(flatQuery, new
 * ZodValidationPipe(schema))` — rather than being a step a controller has to remember to call.
 */
export const flatQuery = {
  transform(value: unknown): FlatQuery {
    const flat: Record<string, string | undefined> = {};
    if (typeof value !== "object" || value === null) return flat;
    for (const [key, entry] of Object.entries(value)) {
      const first: unknown = Array.isArray(entry) ? entry[0] : entry;
      flat[key] = typeof first === "string" ? first : undefined;
    }
    return flat;
  },
};
