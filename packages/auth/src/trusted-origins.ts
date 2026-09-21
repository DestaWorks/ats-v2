/**
 * Origins allowed to make state-changing auth calls, shared by both auth instances.
 *
 * Its own module so the console can read it without importing the operator app's instance —
 * importing that file would construct a second Better Auth for no reason, and quietly give the
 * console a handle on the very instance it exists to stay separate from.
 *
 * `AUTH_TRUSTED_ORIGINS` is a comma-separated list. Development keeps the localhost wildcard,
 * which `next dev` needs because it picks whatever port is free.
 */
export function authTrustedOrigins(): string[] {
  const configured = (process.env["AUTH_TRUSTED_ORIGINS"] ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return process.env.NODE_ENV !== "production" ? [...configured, "http://localhost:*"] : configured;
}
