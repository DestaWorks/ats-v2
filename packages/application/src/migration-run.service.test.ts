import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@destaworks/auth/guards";

/**
 * The run lifecycle around the ETL (Phase 5): staging + enqueue, the capability gate on both ends,
 * and the operator's status read. The ETL itself is covered by `migration.service.test.ts` and the
 * end-to-end resume behaviour by the job handler's test — this one is about the record.
 */

const h = vi.hoisted(() => ({
  runRepo: {
    create: vi.fn(),
    findById: vi.fn(),
    setJobId: vi.fn(),
    claimForAttempt: vi.fn(),
    recordProgress: vi.fn(),
    finish: vi.fn(),
    markInterrupted: vi.fn(),
  },
  userRepo: { findActorById: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/migration-run.repository", () => ({
  migrationRunRepository: h.runRepo,
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({ userRepository: h.userRepo }));

import { migrationRunService } from "./migration-run.service";
import {
  clearMigrationCommitEnqueuer,
  registerMigrationCommitEnqueuer,
} from "./migration-commit.port";

const owner: AuthUser = { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" };
const associate: AuthUser = { id: "u2", email: "a@desta.works", name: "A", role: "Associate" };

const CONTENT = "ID,Name,Status\nL-1,Jane,0 - New Candidate\n";
const NOW = new Date("2026-08-28T10:00:00.000Z");

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "run-1",
    jobId: "job-1",
    status: "running",
    attempt: 1,
    processedRows: 40,
    totalRows: 100,
    checksum: "c".repeat(64),
    format: "csv",
    filename: "export.csv",
    extractWithAi: false,
    content: CONTENT,
    resumes: [],
    report: null,
    failureCode: null,
    startedById: "u1",
    createdAt: NOW,
    updatedAt: NOW,
    startedAt: NOW,
    finishedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(h.runRepo)) fn.mockReset();
  h.userRepo.findActorById.mockReset();
  clearMigrationCommitEnqueuer();
});

describe("start", () => {
  it("stages the upload, queues it, and answers with the run id", async () => {
    h.runRepo.create.mockResolvedValue({ id: "run-1" });
    h.runRepo.setJobId.mockResolvedValue({});
    const enqueue = vi.fn().mockResolvedValue("job-1");
    registerMigrationCommitEnqueuer(enqueue);

    const accepted = await migrationRunService.start(
      { format: "csv", content: CONTENT, filename: "export.csv" },
      owner,
    );

    expect(accepted).toEqual({ runId: "run-1", jobId: "job-1", status: "queued" });
    expect(enqueue).toHaveBeenCalledWith("run-1");
    expect(h.runRepo.setJobId).toHaveBeenCalledWith("run-1", "job-1");
    // The staged row carries the content and the same checksum the ETL will recompute.
    const [staged] = h.runRepo.create.mock.calls[0]!;
    expect(staged).toMatchObject({ content: CONTENT, format: "csv", startedById: "u1" });
    expect(String((staged as { checksum: string }).checksum)).toHaveLength(64);
  });

  it("refuses a role without bulkImport before writing anything", async () => {
    registerMigrationCommitEnqueuer(vi.fn());
    await expect(
      migrationRunService.start({ format: "csv", content: CONTENT }, associate),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.runRepo.create).not.toHaveBeenCalled();
  });

  it("fails loudly when no runner is registered, rather than importing inline", async () => {
    h.runRepo.create.mockResolvedValue({ id: "run-1" });
    await expect(
      migrationRunService.start({ format: "csv", content: CONTENT }, owner),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("state", () => {
  it("maps the row onto the wire shape, dates as ISO strings", async () => {
    h.runRepo.findById.mockResolvedValue(runRow());
    const state = await migrationRunService.state("run-1", owner);
    expect(state).toMatchObject({
      runId: "run-1",
      status: "running",
      processedRows: 40,
      totalRows: 100,
      queuedAt: NOW.toISOString(),
      finishedAt: null,
      report: null,
    });
  });

  it("404s an unknown run", async () => {
    h.runRepo.findById.mockResolvedValue(null);
    await expect(migrationRunService.state("nope", owner)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is gated on bulkImport — the report names candidates", async () => {
    await expect(migrationRunService.state("run-1", associate)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.runRepo.findById).not.toHaveBeenCalled();
  });
});

describe("claim", () => {
  it("returns null when the conditional claim finds nothing to take", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(null);
    expect(await migrationRunService.claim("run-1", 1)).toBeNull();
    expect(h.userRepo.findActorById).not.toHaveBeenCalled();
  });

  it("rebuilds the input and re-reads the actor's CURRENT role", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow({ extractWithAi: true }));
    h.userRepo.findActorById.mockResolvedValue({
      id: "u1",
      email: "o@desta.works",
      name: "Owner",
      role: "Owner",
    });

    const claimed = await migrationRunService.claim("run-1", 2);

    expect(h.userRepo.findActorById).toHaveBeenCalledWith("u1");
    expect(claimed?.input).toMatchObject({
      format: "csv",
      content: CONTENT,
      filename: "export.csv",
      extractWithAi: true,
    });
    expect(claimed?.resumeFromRow).toBe(40);
    expect(claimed?.actor.role).toBe("Owner");
  });

  it("refuses a run whose actor lost the capability after it was queued", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow());
    h.userRepo.findActorById.mockResolvedValue({
      id: "u1",
      email: "o@desta.works",
      name: "Owner",
      role: "Associate",
    });
    await expect(migrationRunService.claim("run-1", 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a run whose staged upload has already been cleared", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow({ content: null }));
    await expect(migrationRunService.claim("run-1", 1)).rejects.toMatchObject({ code: "INTERNAL" });
  });
});
