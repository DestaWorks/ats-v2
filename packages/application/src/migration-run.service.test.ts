import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TenantContext } from "@destaworks/domain/tenant";

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
  membershipRepo: { listActiveForUser: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/migration-run.repository", () => ({
  migrationRunRepository: h.runRepo,
}));
vi.mock("@destaworks/db/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@destaworks/db/memberships", () => ({ membershipReader: h.membershipRepo }));

import { migrationRunService } from "./migration-run.service";
import {
  clearMigrationCommitEnqueuer,
  registerMigrationCommitEnqueuer,
} from "./migration-commit.port";

const owner: TenantContext = {
  tenantId: "t1",
  membershipId: "u1-m",
  user: { id: "u1", email: "o@desta.works", name: "Owner" },
  role: "Owner",
};
const associate: TenantContext = {
  tenantId: "t1",
  membershipId: "u2-m",
  user: { id: "u2", email: "a@desta.works", name: "A" },
  role: "Associate",
};

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
    tenantId: "t1",
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
  h.membershipRepo.listActiveForUser.mockReset();
  clearMigrationCommitEnqueuer();
});

/** The actor as the worker re-reads them: identity from the user row, role from the membership. */
function actorIs(role: string, tenantId = "t1"): void {
  h.userRepo.findActorById.mockResolvedValue({
    id: "u1",
    email: "o@desta.works",
    name: "Owner",
    // Still on the user row and deliberately contradicting the membership below, so a test that
    // passes could not be reading it.
    role: "Owner",
  });
  h.membershipRepo.listActiveForUser.mockResolvedValue([
    { id: "u1-m", tenantId, tenantSlug: tenantId, tenantName: tenantId, role },
  ]);
}

const ctx = {
  tenantId: "t1",
  membershipId: "m1",
  role: "Owner" as const,
  user: { id: "u1", email: "u@desta.works", name: "U" },
};

describe("start", () => {
  it("stages the upload, queues it, and answers with the run id", async () => {
    h.runRepo.create.mockResolvedValue({ id: "run-1" });
    h.runRepo.setJobId.mockResolvedValue({});
    const enqueue = vi.fn().mockResolvedValue("job-1");
    registerMigrationCommitEnqueuer(enqueue);

    const accepted = await migrationRunService.start(owner, {
      format: "csv",
      content: CONTENT,
      filename: "export.csv",
    });

    expect(accepted).toEqual({ runId: "run-1", jobId: "job-1", status: "queued" });
    expect(enqueue).toHaveBeenCalledWith("run-1", "t1");
    expect(h.runRepo.setJobId).toHaveBeenCalledWith(owner, "run-1", "job-1");
    // The staged row carries the content and the same checksum the ETL will recompute.
    const [, staged] = h.runRepo.create.mock.calls[0]!;
    expect(staged).toMatchObject({ content: CONTENT, format: "csv", startedById: "u1" });
    expect(String((staged as { checksum: string }).checksum)).toHaveLength(64);
  });

  it("refuses a role without bulkImport before writing anything", async () => {
    registerMigrationCommitEnqueuer(vi.fn());
    await expect(
      migrationRunService.start(associate, { format: "csv", content: CONTENT }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.runRepo.create).not.toHaveBeenCalled();
  });

  it("fails loudly when no runner is registered, rather than importing inline", async () => {
    h.runRepo.create.mockResolvedValue({ id: "run-1" });
    await expect(
      migrationRunService.start(owner, { format: "csv", content: CONTENT }),
    ).rejects.toMatchObject({ code: "INTERNAL" });
  });
});

describe("state", () => {
  it("maps the row onto the wire shape, dates as ISO strings", async () => {
    h.runRepo.findById.mockResolvedValue(runRow());
    const state = await migrationRunService.state(owner, "run-1");
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
    await expect(migrationRunService.state(owner, "nope")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("is gated on bulkImport — the report names candidates", async () => {
    await expect(migrationRunService.state(associate, "run-1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.runRepo.findById).not.toHaveBeenCalled();
  });
});

describe("claim", () => {
  it("returns null when the conditional claim finds nothing to take", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(null);
    expect(await migrationRunService.claim(ctx, "run-1", 1)).toBeNull();
    expect(h.userRepo.findActorById).not.toHaveBeenCalled();
  });

  it("rebuilds the input and re-reads the actor's CURRENT role", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow({ extractWithAi: true }));
    actorIs("Owner");

    const claimed = await migrationRunService.claim(ctx, "run-1", 2);

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

  it("resumes inside the run's OWN tenant, not whichever the actor defaults to", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow({ tenantId: "t2" }));
    h.userRepo.findActorById.mockResolvedValue({
      id: "u1",
      email: "o@desta.works",
      name: "Owner",
      role: "Owner",
    });
    // Owner in the tenant they usually work in, Screener in the one this run belongs to.
    h.membershipRepo.listActiveForUser.mockResolvedValue([
      { id: "u1-m1", tenantId: "t1", tenantSlug: "t1", tenantName: "t1", role: "Owner" },
      { id: "u1-m2", tenantId: "t2", tenantSlug: "t2", tenantName: "t2", role: "Screener" },
    ]);

    // A Screener holds no `bulkImport`, so picking the run's tenant is what refuses this.
    await expect(migrationRunService.claim(ctx, "run-1", 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a run whose actor lost the capability after it was queued", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow());
    actorIs("Associate");
    await expect(migrationRunService.claim(ctx, "run-1", 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a run whose actor is no longer a member of its tenant", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow());
    actorIs("Owner", "some-other-tenant");
    await expect(migrationRunService.claim(ctx, "run-1", 1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses a run whose staged upload has already been cleared", async () => {
    h.runRepo.claimForAttempt.mockResolvedValue(runRow({ content: null }));
    await expect(migrationRunService.claim(ctx, "run-1", 1)).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });
});
