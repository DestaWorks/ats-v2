import { describe, expect, it } from "vitest";
import { AppError } from "@destaworks/integrations/http/app-error";
import { jobsConnectionString, jobsPoolMax } from "./boss";

const DIRECT = "postgresql://user:pw@db.example.com:5432/postgres";
const POOLED = "postgresql://user:pw@pooler.example.com:6543/postgres?pgbouncer=true";

describe("jobsConnectionString", () => {
  /**
   * The one that silently produces a queue that never fires: `LISTEN/NOTIFY` and the advisory
   * locks pg-boss uses are session state, and Supabase's transaction pooler hands back a
   * different session per transaction. Nothing errors — jobs are accepted and no worker is ever
   * woken — so this must be a refusal, never a fallback.
   */
  it("uses DIRECT_URL", () => {
    expect(jobsConnectionString({ DIRECT_URL: DIRECT, DATABASE_URL: POOLED })).toBe(DIRECT);
  });

  it("refuses to fall back to the pooled DATABASE_URL", () => {
    expect(() => jobsConnectionString({ DATABASE_URL: POOLED })).toThrow(AppError);
  });
});

describe("jobsPoolMax", () => {
  it("caps each role explicitly, because a second unbounded pool is how the database falls over", () => {
    expect(jobsPoolMax("worker", {})).toBe(4);
    expect(jobsPoolMax("sender", {})).toBe(2);
  });

  it("lets the host raise a role's cap without a code change", () => {
    expect(jobsPoolMax("worker", { JOBS_WORKER_POOL_MAX: "8" })).toBe(8);
    expect(jobsPoolMax("sender", { JOBS_SENDER_POOL_MAX: "3" })).toBe(3);
  });

  it("ignores a value that is not a positive integer rather than opening zero connections", () => {
    expect(jobsPoolMax("worker", { JOBS_WORKER_POOL_MAX: "0" })).toBe(4);
    expect(jobsPoolMax("worker", { JOBS_WORKER_POOL_MAX: "lots" })).toBe(4);
  });
});
