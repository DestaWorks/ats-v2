/**
 * The pathname of a request URL and nothing else. The query string can carry a candidate name
 * typed into a search box, so it must never reach a log line (CLAUDE.md ground rule 1).
 *
 * `base` lets a server-relative target — what Node/Express hand a request handler — be resolved
 * by the same rule as the absolute URL a `Request` carries, so both frameworks log the same shape.
 */
export function safePathname(url: string, base?: string): string {
  try {
    return new URL(url, base).pathname;
  } catch {
    return "unknown";
  }
}
