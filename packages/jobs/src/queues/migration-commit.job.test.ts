import { describe, it, expect, beforeEach, vi } from "vitest";
import { toLegacyStatusLabel } from "@destaworks/domain/constants";
import type { ImportReport } from "@destaworks/contracts/validation/migration";
import type { JobContext } from "../queue";

/**
 * `migration.commit` end to end WITHOUT a database: the real handler drives the real
 * `migrationRunService` and the real `migrationService` — parse, transform, dedupe and all — over
 * in-memory repository fakes that behave like the tables they stand in for.
 *
 * Mocking the services instead would have proved only that the handler calls them. The claim this
 * job has to earn is that a commit killed halfway and retried does not double-import, and that
 * claim lives in the interaction between the run row, the resume marker and the `legacy_id` upsert
 * — so the test drives all three and counts the rows that came out.
 */

interface StoredCandidate {
  id: string;
  legacyId: string;
  email: string | null;
  updatedAt: Date;
  createdAt: Date;
}

interface StoredRun {
  id: string;
  jobId: string | null;
  status: string;
  attempt: number;
  processedRows: number;
  totalRows: number;
  checksum: string;
  format: string;
  filename: string | null;
  extractWithAi: boolean;
  content: string | null;
  resumes: unknown;
  report: unknown;
  failureCode: string | null;
  startedById: string;
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const store = vi.hoisted(() => ({
  candidates: new Map<string, StoredCandidate>(),
  runs: new Map<string, StoredRun>(),
  /** Every `upsertByLegacyId` call, in order — the "did it write again" counter. */
  upserts: [] as string[],
  seq: 0,
}));

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  /** The one tenant this fixture runs in — the run's, and the actor's membership's. */
  tenant: "t1",
  actor: { id: "u1", email: "owner@desta.works", name: "Owner" } as {
    id: string;
    email: string;
    name: string;
  } | null,
  /**
   * The actor's membership in the run's tenant, which is where `claim` now reads their role.
   * Held apart from `actor` so a test can revoke the membership without deleting the user.
   */
  membership: { tenantId: "t1", role: "Owner" as string } as {
    tenantId: string;
    role: string;
  } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTenantTransaction: (_ctx: unknown, fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@destaworks/db/repositories/client.repository", () => ({
  clientRepository: { list: () => Promise.resolve([]) },
}));
vi.mock("@destaworks/db/repositories/document.repository", () => ({
  documentRepository: { upsertByLegacyId: () => Promise.resolve({ id: "doc-1" }) },
}));
vi.mock("@destaworks/db/repositories/candidate.repository", () => ({
  candidateRepository: {
    listForDedupe: () => Promise.resolve([...store.candidates.values()]),
    upsertByLegacyId: (_ctx: unknown, legacyId: string) => {
      store.upserts.push(legacyId);
      const existing = store.candidates.get(legacyId);
      if (existing) return Promise.resolve(existing);
      const created: StoredCandidate = {
        id: `db-${legacyId}`,
        legacyId,
        email: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      };
      store.candidates.set(legacyId, created);
      return Promise.resolve(created);
    },
  },
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({
  userRepository: { findActorById: () => Promise.resolve(h.actor) },
}));
vi.mock("@destaworks/db/memberships", () => ({
  membershipReader: {
    listActiveForUser: (userId: string) =>
      Promise.resolve(
        h.membership === null
          ? []
          : [
              {
                id: `${userId}-m`,
                tenantId: h.membership.tenantId,
                tenantSlug: h.membership.tenantId,
                tenantName: h.membership.tenantId,
                role: h.membership.role,
              },
            ],
      ),
  },
}));

/**
 * The run table, with the one behaviour that matters: the claim is conditional on status.
 *
 * The leading `_ctx` on `create` / `findById` / `setJobId` is not decoration: those three are
 * reached through `start` and `state`, which hold a `TenantContext` and now pass it (6.4). The
 * four below them are reached from the JOB, which runs outside any request and has no context to
 * pass — so they still take the id first. The split in this double is the split still open in the
 * service.
 */
vi.mock("@destaworks/db/repositories/migration-run.repository", () => ({
  migrationRunRepository: {
    create: (_ctx: unknown, data: Record<string, unknown>) => {
      store.seq += 1;
      const now = new Date();
      const run: StoredRun = {
        id: `run-${store.seq}`,
        jobId: null,
        status: "queued",
        attempt: 0,
        processedRows: 0,
        totalRows: 0,
        checksum: String(data.checksum),
        format: String(data.format),
        filename: (data.filename as string | null) ?? null,
        extractWithAi: Boolean(data.extractWithAi),
        content: String(data.content),
        resumes: data.resumes ?? [],
        report: null,
        failureCode: null,
        startedById: String(data.startedById),
        // The tenant-scope extension supplies this on the real client; the fake stands in for it.
        tenantId: (data.tenantId as string | null) ?? h.tenant,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
      };
      store.runs.set(run.id, run);
      return Promise.resolve(run);
    },
    findById: (_ctx: unknown, id: string) => Promise.resolve(store.runs.get(id) ?? null),
    setJobId: (_ctx: unknown, id: string, jobId: string) => {
      const run = store.runs.get(id);
      if (run) run.jobId = jobId;
      return Promise.resolve(run);
    },
    claimForAttempt: (_ctx: unknown, id: string, attempt: number, now: Date) => {
      const run = store.runs.get(id);
      if (!run || !["queued", "running", "interrupted"].includes(run.status)) {
        return Promise.resolve(null);
      }
      run.status = "running";
      run.attempt = attempt;
      run.startedAt = now;
      return Promise.resolve(run);
    },
    recordProgress: (_ctx: unknown, id: string, processedRows: number, totalRows: number) => {
      const run = store.runs.get(id);
      if (run) Object.assign(run, { processedRows, totalRows, updatedAt: new Date() });
      return Promise.resolve(run);
    },
    finish: (
      _ctx: unknown,
      id: string,
      data: { status: string; report?: unknown; failureCode?: string },
      now: Date,
    ) => {
      const run = store.runs.get(id);
      if (run) {
        Object.assign(run, {
          status: data.status,
          report: data.report ?? run.report,
          failureCode: data.failureCode ?? null,
          finishedAt: now,
          content: null,
          resumes: [],
        });
      }
      return Promise.resolve(run);
    },
    markInterrupted: (_ctx: unknown, id: string, processedRows: number) => {
      const run = store.runs.get(id);
      if (run) Object.assign(run, { status: "interrupted", processedRows });
      return Promise.resolve(run);
    },
  },
}));

import { migrationRunService } from "@destaworks/application/migration-run.service";
import {
  clearMigrationCommitEnqueuer,
  registerMigrationCommitEnqueuer,
} from "@destaworks/application/migration-commit.port";
import { handleMigrationCommit, migrationCommitJob } from "./migration-commit.job";

const OWNER = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "owner@desta.works", name: "Owner" },
  role: "Owner" as const,
};
const NEW = toLegacyStatusLabel("NEW_CANDIDATE");

function csv(count: number): string {
  const header = "ID,Name,Status,Email,UpdatedAt";
  const rows = Array.from(
    { length: count },
    (_, i) => `L-${i + 1},Person ${i + 1},${NEW},p${i + 1}@example.com,2026-01-0${(i % 9) + 1}`,
  );
  return [header, ...rows].join("\n") + "\n";
}

interface FakeCtx {
  ctx: JobContext<{ runId: string; tenantId: string }>;
  progress: { done: number; total: number }[];
  abort: (afterRows: number) => void;
}

/** A `JobContext` with no queue behind it. `abort(n)` fires the signal once n rows are reported,
 *  which is how the timeout path is exercised without waiting for a real 30-minute budget. */
function fakeCtx(runId: string, attempt: number): FakeCtx {
  const controller = new AbortController();
  const progress: { done: number; total: number }[] = [];
  let abortAfter: number | null = null;
  return {
    progress,
    abort: (afterRows) => {
      abortAfter = afterRows;
    },
    ctx: {
      payload: { runId, tenantId: "t1" },
      attempt,
      signal: controller.signal,
      reportProgress: (done, total) => {
        progress.push({ done, total });
        if (abortAfter !== null && done >= abortAfter) controller.abort();
        return Promise.resolve();
      },
    },
  };
}

/** Stage a run the way the route does, with a stub enqueuer standing in for the driver. */
async function stage(rowCount: number): Promise<string> {
  registerMigrationCommitEnqueuer((runId) => Promise.resolve(`job-${runId}`));
  const accepted = await migrationRunService.start(OWNER, {
    format: "csv",
    content: csv(rowCount),
  });
  return accepted.runId;
}

beforeEach(() => {
  store.candidates.clear();
  store.runs.clear();
  store.upserts = [];
  store.seq = 0;
  h.actor = { id: "u1", email: "owner@desta.works", name: "Owner" };
  h.membership = { tenantId: h.tenant, role: "Owner" };
  clearMigrationCommitEnqueuer();
});

describe("the job definition", () => {
  it("retries once, because a partial import is expensive and rarely transient twice", () => {
    expect(migrationCommitJob.name).toBe("migration.commit");
    expect(migrationCommitJob.maxAttempts).toBe(2);
  });

  it("gets a budget well past the 300s route ceiling it was moved off", () => {
    expect(migrationCommitJob.timeoutMs).toBeGreaterThan(300_000);
  });

  it("validates its payload on dequeue, not just on enqueue", () => {
    expect(migrationCommitJob.schema.safeParse({ runId: "run-1", tenantId: "t1" }).success).toBe(
      true,
    );
    expect(migrationCommitJob.schema.safeParse({}).success).toBe(false);
    // A payload without a tenant cannot be scoped, so it is refused rather than run unscoped.
    expect(migrationCommitJob.schema.safeParse({ runId: "run-1" }).success).toBe(false);
    expect(
      migrationCommitJob.schema.safeParse({ runId: "r", tenantId: "t1", extra: 1 }).success,
    ).toBe(false);
  });
});

describe("a clean run", () => {
  it("imports every row and finishes the run with the report", async () => {
    const runId = await stage(3);
    const { ctx, progress } = fakeCtx(runId, 1);

    await handleMigrationCommit(ctx);

    expect(store.candidates.size).toBe(3);
    const run = await migrationRunService.state(OWNER, runId);
    expect(run.status).toBe("succeeded");
    expect(run.report?.counts.added).toBe(3);
    expect(progress.at(-1)).toEqual({ done: 3, total: 3 });
  });

  it("clears the staged upload once there will be no more attempts", async () => {
    const runId = await stage(2);
    await handleMigrationCommit(fakeCtx(runId, 1).ctx);
    expect(store.runs.get(runId)?.content).toBeNull();
  });
});

describe("idempotency — the same run handled twice", () => {
  it("writes nothing on a duplicate delivery of a finished run", async () => {
    const runId = await stage(3);
    await handleMigrationCommit(fakeCtx(runId, 1).ctx);
    const afterFirst = store.upserts.length;

    // The queue delivered the same job again — at-least-once is the normal guarantee.
    await handleMigrationCommit(fakeCtx(runId, 2).ctx);

    expect(store.upserts.length).toBe(afterFirst);
    expect(store.candidates.size).toBe(3);
  });

  it("imports nothing new when a completed run is re-driven from the very start", async () => {
    const runId = await stage(3);
    await handleMigrationCommit(fakeCtx(runId, 1).ctx);
    const idsAfterFirst = [...store.candidates.keys()].sort();

    // Force the worst case the resume marker cannot help with: the run is handed back as if
    // nothing had been recorded, so attempt 2 replays EVERY row. Only the `legacy_id` natural key
    // stands between this and a doubled import.
    const run = store.runs.get(runId);
    Object.assign(run ?? {}, {
      status: "interrupted",
      processedRows: 0,
      content: csv(3),
      report: null,
      finishedAt: null,
    });
    store.upserts = [];

    await handleMigrationCommit(fakeCtx(runId, 2).ctx);

    expect(store.upserts.length).toBe(3); // every row was re-attempted...
    expect(store.candidates.size).toBe(3); // ...and not one of them created a second candidate.
    expect([...store.candidates.keys()].sort()).toEqual(idsAfterFirst);

    const state = await migrationRunService.state(OWNER, runId);
    const report: ImportReport | null = state.report;
    expect(report?.counts.added).toBe(0);
    expect(report?.counts.updated).toBe(3);
  });
});

describe("abort", () => {
  it("stops at a row boundary and leaves the run resumable, not failed", async () => {
    const runId = await stage(5);
    const first = fakeCtx(runId, 1);
    first.abort(2);

    await expect(handleMigrationCommit(first.ctx)).rejects.toThrow(/interrupted/i);

    // Two complete rows, no third half-written one.
    expect(store.candidates.size).toBe(2);
    const run = store.runs.get(runId);
    expect(run?.status).toBe("interrupted");
    expect(run?.processedRows).toBe(2);
    expect(run?.content).not.toBeNull();
  });

  it("resumes the retry after the rows the aborted attempt committed", async () => {
    const runId = await stage(5);
    const first = fakeCtx(runId, 1);
    first.abort(2);
    await expect(handleMigrationCommit(first.ctx)).rejects.toThrow();
    store.upserts = [];

    await handleMigrationCommit(fakeCtx(runId, 2).ctx);

    // Only the three rows the first attempt never reached are written again.
    expect(store.upserts).toEqual(["L-3", "L-4", "L-5"]);
    expect(store.candidates.size).toBe(5);
    const state = await migrationRunService.state(OWNER, runId);
    expect(state.status).toBe("succeeded");
    expect(state.report?.warnings).toContain("resumed-from-row:2");
  });
});

describe("failure", () => {
  it("holds the run open for the retry, then closes it on the last attempt", async () => {
    const runId = await stage(2);
    // The actor vanished between enqueue and run — the claim rejects and the attempt fails.
    h.actor = null;

    await expect(handleMigrationCommit(fakeCtx(runId, 1).ctx)).rejects.toThrow();
    expect(store.runs.get(runId)?.status).toBe("interrupted");
    expect(store.runs.get(runId)?.content).not.toBeNull();

    await expect(
      handleMigrationCommit(fakeCtx(runId, migrationCommitJob.maxAttempts).ctx),
    ).rejects.toThrow();
    const run = store.runs.get(runId);
    expect(run?.status).toBe("failed");
    expect(run?.failureCode).toBe("FORBIDDEN");
    expect(run?.content).toBeNull();
  });

  it("refuses a run whose actor no longer holds bulkImport", async () => {
    const runId = await stage(2);
    // Demoted in the tenant the run belongs to. The user row is untouched, which is the point:
    // `claim` reads the membership, so a demotion there is what stops the resumed import.
    h.membership = { tenantId: h.tenant, role: "Associate" };

    await expect(handleMigrationCommit(fakeCtx(runId, 1).ctx)).rejects.toThrow(/permission/i);
    expect(store.candidates.size).toBe(0);
  });

  it("refuses a run whose actor was removed from its tenant", async () => {
    const runId = await stage(2);
    h.membership = null;

    await expect(handleMigrationCommit(fakeCtx(runId, 1).ctx)).rejects.toThrow(/no longer run it/i);
    expect(store.candidates.size).toBe(0);
  });
});
