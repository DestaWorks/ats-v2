/**
 * Date → ISO-string helpers for the wire. DTO projections serialize `Date` columns to ISO
 * strings (both `Response.json` and the RSC produce strings), so a single pair of helpers keeps
 * that consistent across the candidate/note/document services. Pure and isomorphic.
 */

/** ISO-serialize a Date. */
export function toIso(d: Date): string {
  return d.toISOString();
}

/** ISO-serialize a nullable Date; `null`/`undefined` → `null`. */
export function isoOrNull(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}
