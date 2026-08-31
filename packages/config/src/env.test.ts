import { describe, it, expect } from "vitest";
import { EnvironmentError, type EnvSource, parseServerEnv, requireServerEnv } from "./env";

const VALID = {
  DATABASE_URL: "postgresql://user:pass@db.example.com:6543/app",
  DIRECT_URL: "postgres://user:pass@db.example.com:5432/app",
  BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
};

function problemsOf(env: EnvSource): readonly string[] {
  try {
    parseServerEnv(env);
  } catch (error) {
    if (error instanceof EnvironmentError) return error.problems;
    throw error;
  }
  throw new Error("expected parseServerEnv to throw");
}

describe("the three variables a server process cannot start without", () => {
  it("accepts a complete minimum environment", () => {
    expect(() => requireServerEnv(VALID)).not.toThrow();
  });

  it.each(["DATABASE_URL", "DIRECT_URL", "BETTER_AUTH_SECRET"])("refuses a missing %s", (name) => {
    const withoutOne: Record<string, string> = { ...VALID };
    delete withoutOne[name];
    expect(problemsOf(withoutOne).join("\n")).toContain(name);
  });

  it("reports EVERY problem at once, so one deploy fixes the environment", () => {
    expect(problemsOf({})).toHaveLength(3);
  });

  it("refuses a connection string that is not Postgres", () => {
    expect(problemsOf({ ...VALID, DATABASE_URL: "mysql://user:pass@host:3306/app" })).toEqual([
      "DATABASE_URL must be a postgres:// or postgresql:// connection string.",
    ]);
  });

  it("refuses a secret short enough to be a placeholder", () => {
    expect(problemsOf({ ...VALID, BETTER_AUTH_SECRET: "changeme" })).toHaveLength(1);
  });
});

describe("it never echoes a value, because half of these are credentials", () => {
  it("names the variable and not its contents", () => {
    const secret = "postgresql-lookalike-with-a-password-in-it";
    const message = problemsOf({ ...VALID, DATABASE_URL: secret }).join("\n");
    expect(message).toContain("DATABASE_URL");
    expect(message).not.toContain(secret);
  });
});

describe("optional variables are validated when present, never silently ignored", () => {
  it("accepts an absent optional", () => {
    expect(() => requireServerEnv(VALID)).not.toThrow();
  });

  it("refuses a pool size that is not a positive whole number", () => {
    expect(problemsOf({ ...VALID, DB_POOL_MAX: "twenty" })).toHaveLength(1);
    expect(problemsOf({ ...VALID, JOBS_WORKER_POOL_MAX: "0" })).toHaveLength(1);
    expect(() => requireServerEnv({ ...VALID, DB_POOL_MAX: "20" })).not.toThrow();
  });

  it("refuses an origin list with a path, a trailing slash, or no scheme", () => {
    expect(problemsOf({ ...VALID, WEB_ORIGINS: "https://app.example.com/" })).toHaveLength(1);
    expect(problemsOf({ ...VALID, WEB_ORIGINS: "app.example.com" })).toHaveLength(1);
    expect(problemsOf({ ...VALID, WEB_ORIGINS: "https://a.example.com/admin" })).toHaveLength(1);
  });

  it("accepts a comma-separated origin allowlist", () => {
    expect(() =>
      requireServerEnv({ ...VALID, WEB_ORIGINS: "https://app.example.com, http://localhost:3003" }),
    ).not.toThrow();
  });

  it("refuses a log level the logger does not have", () => {
    expect(problemsOf({ ...VALID, LOG_LEVEL: "verbose" })).toHaveLength(1);
    expect(() => requireServerEnv({ ...VALID, LOG_LEVEL: "info" })).not.toThrow();
  });
});
