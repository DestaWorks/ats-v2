export const REDACTED = "[Redacted]";

export const SENSITIVE_KEYS = [
  "email",
  "emailAddress",
  "phone",
  "phoneNumber",
  "mobile",
  "licenseNumber",
  "license",
  "npi",
  "dea",
  "ssn",
  "name",
  "firstName",
  "lastName",
  "fullName",
  "dateOfBirth",
  "dob",
  "address",
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
] as const;

const MAX_REDACT_DEPTH = 4;

const SENSITIVE_SET: ReadonlySet<string> = new Set<string>(
  SENSITIVE_KEYS.map((k) => k.toLowerCase()),
);

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_SET.has(key.toLowerCase());
}

export const PINO_REDACT_PATHS: readonly string[] = SENSITIVE_KEYS.flatMap((key) => {
  const paths: string[] = [];
  for (let depth = 0; depth <= MAX_REDACT_DEPTH; depth += 1) {
    paths.push(depth === 0 ? key : `${"*.".repeat(depth)}${key}`);
  }
  return paths;
});

export function redactFields(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > MAX_REDACT_DEPTH + 1) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactFields(item, depth + 1));
  if (value instanceof Error) return { type: value.name };
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactFields(item, depth + 1);
  }
  return out;
}
