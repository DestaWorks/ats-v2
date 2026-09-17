/**
 * Validate a post-sign-in destination.
 *
 * A sign-in page that forwards to whatever `?next=` says is an open redirect: the link lives on a
 * domain the user trusts, so `…/sign-in?next=https://evil.example` is a credible way to land them
 * somewhere hostile with their guard down. The destination is therefore checked against origins the
 * deployment already names, and anything else is discarded rather than followed.
 *
 * Relative paths are allowed, since they cannot leave the app — except protocol-relative ones
 * (`//evil.example`), which a browser resolves as an absolute URL to another host.
 */
export function safeReturnTo(
  raw: string | null | undefined,
  allowedOrigins: readonly string[],
): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (candidate === "") return null;

  if (candidate.startsWith("/")) return candidate.startsWith("//") ? null : candidate;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const permitted = allowedOrigins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && !origin.includes("*"));

  return permitted.includes(url.origin) ? url.toString() : null;
}
