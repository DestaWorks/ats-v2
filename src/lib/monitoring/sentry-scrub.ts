/**
 * PII/PHI scrubbing for Sentry events — ISOMORPHIC (imported from both the browser init,
 * `instrumentation-client.ts`, and the server/edge init, `instrumentation.ts`), so this file
 * takes no server-only imports and no Sentry SDK instance, only the plain event/breadcrumb data
 * shapes.
 *
 * This app's binding rule (CONVENTIONS §7, enforced everywhere else this session — e.g. the AI
 * failure logging in `server/ai/shared.ts`) is that application/observability logs must NEVER
 * carry PII/PHI. An error tracker is the easiest place to violate that by accident: a stack
 * trace's request context can carry cookies/auth headers, and `extra`/`contexts`/breadcrumb data
 * can carry whatever a caller happened to attach (a candidate name, an email, a license number).
 * Every Sentry event and breadcrumb passes through here before it ever leaves the process —
 * scrubbing is mandatory, not a follow-up.
 *
 * Deliberately NOT scrubbed: `exception`/`message` (the actual error text + stack trace) — JS
 * stack traces carry function names/file paths/line numbers, never local variable VALUES (unlike
 * e.g. Python), so they're low-risk by construction. This relies on the codebase's existing
 * discipline of never interpolating PII into a thrown Error's message — the same discipline
 * already required for `AppError` messages everywhere else.
 */
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

/** Matches broadly on purpose — a false positive (redacting a harmless "hostname" key) costs
 *  nothing; a false negative (letting a real "licenseNumber" through) is the failure mode that
 *  actually matters here. */
const SENSITIVE_KEY_PATTERN =
  /email|phone|name|address|license|npi|dea|ssn|password|passwd|secret|token|auth|cookie|session|dob|birth/i;

const REDACTED = "[Filtered]";

/** Deep-walks a plain object/array, replacing any value whose key matches the sensitive pattern.
 *  Depth-capped as a defensive measure against pathological/cyclic-looking structures — Sentry's
 *  own event payloads are shallow in practice. */
function scrubDeep<T>(value: T, depth = 0): T {
  if (value == null || depth > 8) return value;
  if (Array.isArray(value)) {
    return value.map((v) => scrubDeep(v, depth + 1)) as unknown as T;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : scrubDeep(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** `beforeSend` — strips request payload/cookies/most headers (a body, query string, or cookie
 *  can carry candidate PII or a session token), reduces `user` to an opaque id (never
 *  email/name), and deep-scrubs `extra`/`contexts`/`tags`. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    const { url, method, headers } = event.request;
    const userAgent = headers?.["user-agent"] ?? headers?.["User-Agent"];
    event.request = {
      ...(url !== undefined && { url }),
      ...(method !== undefined && { method }),
      ...(userAgent ? { headers: { "user-agent": userAgent } } : {}),
      // Explicitly omitted: data (POST body), query_string, cookies, env.
    };
  }
  if (event.user) {
    if (event.user.id) event.user = { id: event.user.id };
    else delete event.user;
  }
  if (event.extra) event.extra = scrubDeep(event.extra);
  if (event.contexts) event.contexts = scrubDeep(event.contexts);
  if (event.tags) event.tags = scrubDeep(event.tags) as typeof event.tags;
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  return event;
}

/** `beforeBreadcrumb` — deep-scrubs breadcrumb `data` (network breadcrumbs only carry sizes by
 *  default, not bodies, but custom/console breadcrumbs can carry arbitrary content) and hard-caps
 *  console-breadcrumb message length. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) breadcrumb.data = scrubDeep(breadcrumb.data);
  if (breadcrumb.category === "console" && breadcrumb.message) {
    breadcrumb.message = breadcrumb.message.slice(0, 200);
  }
  return breadcrumb;
}
