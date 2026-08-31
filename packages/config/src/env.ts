import { z } from "zod";

/**
 * The environment a server process needs before it can serve anything.
 *
 * It exists because the failure it prevents already happened: a missing `BETTER_AUTH_SECRET`
 * crashed the API *after* it had logged `api.listening`, so the orchestrator saw a started
 * process, routed traffic to it, and the first request found a dead server. Every variable was an
 * unchecked `process.env` string, so the only thing that validated the environment was production
 * traffic.
 *
 * Two properties matter more than coverage. It runs BEFORE the listener opens, so a bad
 * environment is a failed deploy rather than a served error; and it reports EVERY problem at once,
 * because an operator fixing one missing variable per deploy cycle is how a ten-minute rollout
 * becomes an afternoon.
 *
 * It never echoes a value — only the variable's name and what was wrong with it. Half of these are
 * credentials, and the message ends up in a build log.
 */

const POSTGRES_URL = /^postgres(ql)?:\/\/./;

/** Long enough that it cannot be a placeholder; `openssl rand -base64 32` yields 44 characters. */
const MIN_SECRET_LENGTH = 32;

const LOG_LEVELS = ["debug", "info", "warn", "error", "silent"] as const;

const postgresUrl = (name: string): z.ZodType<string> =>
  z
    .string({ error: `${name} is required — a Postgres connection string.` })
    .refine((value) => POSTGRES_URL.test(value), {
      error: `${name} must be a postgres:// or postgresql:// connection string.`,
    });

const positiveInteger = (name: string): z.ZodType<number | undefined> =>
  z
    .string()
    .optional()
    .refine((value) => value === undefined || /^\d+$/.test(value.trim()), {
      error: `${name} must be a positive whole number.`,
    })
    .transform((value) => (value === undefined ? undefined : Number.parseInt(value.trim(), 10)))
    .refine((value) => value === undefined || value > 0, {
      error: `${name} must be greater than zero.`,
    });

function isAbsoluteOrigin(entry: string): boolean {
  if (entry.endsWith("/")) return false;
  try {
    const parsed = new URL(entry);
    return parsed.origin === entry;
  } catch {
    return false;
  }
}

const origins = z
  .string()
  .optional()
  .refine(
    (value) =>
      value === undefined ||
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .every(isAbsoluteOrigin),
    {
      error:
        "WEB_ORIGINS must be a comma-separated list of absolute origins with no trailing slash, e.g. https://app.example.com.",
    },
  );

const serverEnvSchema = z.object({
  DATABASE_URL: postgresUrl("DATABASE_URL"),
  DIRECT_URL: postgresUrl("DIRECT_URL"),
  BETTER_AUTH_SECRET: z
    .string({
      error: "BETTER_AUTH_SECRET is required — generate one with `openssl rand -base64 32`.",
    })
    .min(MIN_SECRET_LENGTH, {
      error: `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters; generate one with \`openssl rand -base64 32\`.`,
    }),
  WEB_ORIGINS: origins,
  LOG_LEVEL: z
    .enum(LOG_LEVELS, { error: `LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}.` })
    .optional(),
  PORT: positiveInteger("PORT"),
  API_PORT: positiveInteger("API_PORT"),
  DB_POOL_MAX: positiveInteger("DB_POOL_MAX"),
  DB_POOL_CONNECTION_TIMEOUT_MS: positiveInteger("DB_POOL_CONNECTION_TIMEOUT_MS"),
  DB_POOL_IDLE_TIMEOUT_MS: positiveInteger("DB_POOL_IDLE_TIMEOUT_MS"),
  JOBS_WORKER_POOL_MAX: positiveInteger("JOBS_WORKER_POOL_MAX"),
  JOBS_SENDER_POOL_MAX: positiveInteger("JOBS_SENDER_POOL_MAX"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** `process.env` widened to what this file actually needs, so a test can pass a plain object. */
export type EnvSource = Readonly<Record<string, string | undefined>>;

export class EnvironmentError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(
      `Refusing to start: ${problems.length} environment problem(s).\n` +
        problems.map((problem) => `  - ${problem}`).join("\n"),
    );
    this.name = "EnvironmentError";
    this.problems = problems;
  }
}

/**
 * Validate the environment, or throw with every problem listed. Values are read from the passed
 * source so a test can drive it without mutating the process.
 */
export function parseServerEnv(source: EnvSource = process.env): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (result.success) return result.data;
  const problems = [...new Set(result.error.issues.map((issue) => issue.message))].sort();
  throw new EnvironmentError(problems);
}

/**
 * The entry-point call. Deliberately returns nothing: the point is the throw, and a process that
 * treated this as an optional lookup would be back to reading `process.env` by hand.
 */
export function requireServerEnv(source: EnvSource = process.env): void {
  parseServerEnv(source);
}
