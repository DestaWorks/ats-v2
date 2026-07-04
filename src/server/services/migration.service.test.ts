import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { toLegacyStatusLabel } from "@/lib/constants";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Migration service (Wave 1.3 §10) WITHOUT a DB: the pure pipeline (sheet-parse + transform +
 * dedupe) runs for real; repositories, `writeAudit`, and `withTransaction` are mocked. Asserts the
 * headline invariants: prepare writes nothing; commit upserts by legacy_id (never `create`, so
 * re-run = no dupes); email-dupes flagged + kept; résumé doc upserted; checksum mismatch warns; and
 * no PII is logged.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  clientRepo: { list: vi.fn() },
  candidateRepo: { list: vi.fn(), upsertByLegacyId: vi.fn() },
  documentRepo: { upsertByLegacyId: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/document.repository", () => ({
  documentRepository: h.documentRepo,
}));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { migrationService } from "./migration.service";

const owner: AuthUser = { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" };
const associate: AuthUser = { id: "u2", email: "a@desta.works", name: "Assoc", role: "Associate" };

const NEW = toLegacyStatusLabel("NEW_CANDIDATE");

/** Build a CSV export from partial rows over a fixed header. */
function csv(rows: Record<string, string>[]): string {
  const headers = ["ID", "Name", "Status", "Email", "UpdatedAt", "ResumeFileID", "ResumeURL"];
  const line = (r: Record<string, string>) => headers.map((hd) => r[hd] ?? "").join(",");
  return [headers.join(","), ...rows.map(line)].join("\n") + "\n";
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.clientRepo.list.mockReset().mockResolvedValue([]);
  h.candidateRepo.list.mockReset().mockResolvedValue([]);
  h.candidateRepo.upsertByLegacyId
    .mockReset()
    .mockImplementation((legacyId: string) => Promise.resolve({ id: `db-${legacyId}`, legacyId }));
  h.documentRepo.upsertByLegacyId.mockReset().mockResolvedValue({ id: "doc-1" });
  h.writeAudit.mockReset().mockResolvedValue(undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

function assertNoPiiLogged(secret: string) {
  for (const spy of [errorSpy, logSpy]) {
    for (const call of spy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secret);
    }
  }
}

describe("migrationService.prepare", () => {
  it("writes NOTHING and reports the planned actions", async () => {
    const content = csv([
      { ID: "L-1", Name: "Jane", Status: NEW, Email: "jane@x.com" },
      { ID: "L-2", Name: "Bad", Status: "99 - Bogus" },
    ]);
    const report = await migrationService.prepare({ format: "csv", content }, owner);

    expect(h.candidateRepo.upsertByLegacyId).not.toHaveBeenCalled();
    expect(h.documentRepo.upsertByLegacyId).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();

    expect(report.counts.added).toBe(1);
    expect(report.counts.errored).toBe(1);
    // rows sorted by legacyId for a stable diff
    expect(report.rows.map((r) => r.legacyId)).toEqual(["L-1", "L-2"]);
    expect(report.rows.find((r) => r.legacyId === "L-2")!.reasons).toContain("unrecognized-status");
  });

  it("403 for a non-bulkImport role", async () => {
    const content = csv([{ ID: "L-1", Name: "Jane", Status: NEW }]);
    await expect(migrationService.prepare({ format: "csv", content }, associate)).rejects.toThrow();
  });
});

describe("migrationService.commit", () => {
  it("is idempotent: only upsertByLegacyId is ever called; a re-run reports all updates, no create", async () => {
    const content = csv([
      { ID: "L-1", Name: "Jane", Status: NEW, Email: "jane@x.com" },
      { ID: "L-2", Name: "John", Status: NEW, Email: "john@x.com" },
    ]);

    // Run 1: nothing in the DB → both added.
    const r1 = await migrationService.commit({ format: "csv", content }, owner);
    expect(r1.counts.added).toBe(2);
    expect(h.candidateRepo.upsertByLegacyId).toHaveBeenCalledTimes(2);
    // audit: one per candidate + one import_batch summary
    expect(h.writeAudit).toHaveBeenCalledTimes(3);
    expect(h.writeAudit.mock.calls.some(([, p]) => p.entity === "import_batch")).toBe(true);
    expect(h.writeAudit.mock.calls.filter(([, p]) => p.action === "import")).toHaveLength(2);

    // Run 2: both legacy ids already present → both update, still only upsert (never create).
    h.candidateRepo.list.mockResolvedValue([
      { id: "db-L-1", legacyId: "L-1", email: "jane@x.com", updatedAt: null, createdAt: null },
      { id: "db-L-2", legacyId: "L-2", email: "john@x.com", updatedAt: null, createdAt: null },
    ]);
    const r2 = await migrationService.commit({ format: "csv", content }, owner);
    expect(r2.counts.added).toBe(0);
    expect(r2.counts.updated).toBe(2);
  });

  it("email-dupes → both written + flagged, keep-newest primary, none dropped", async () => {
    const content = csv([
      { ID: "L-1", Name: "Jane", Status: NEW, Email: "dup@x.com", UpdatedAt: "2024-01-01" },
      { ID: "L-2", Name: "Jane2", Status: NEW, Email: "dup@x.com", UpdatedAt: "2024-06-01" },
    ]);
    const report = await migrationService.commit({ format: "csv", content }, owner);

    // both persisted (nothing dropped/merged)
    expect(h.candidateRepo.upsertByLegacyId).toHaveBeenCalledTimes(2);
    expect(report.counts.flagged).toBe(2);
    expect(report.emailDuplicateGroups).toHaveLength(1);
    expect(report.emailDuplicateGroups[0]).toMatchObject({
      email: "dup@x.com",
      keptLegacyId: "L-2",
    });
    // the Needs Review control tag was written into the create payload
    const [, create] = h.candidateRepo.upsertByLegacyId.mock.calls[0]!;
    expect(create.tags).toContain("Needs Review");
  });

  it("a résumé trio → a documents upsert keyed by ResumeFileID, linked to the candidate", async () => {
    const content = csv([
      { ID: "L-1", Name: "Jane", Status: NEW, ResumeFileID: "drive-1", ResumeURL: "https://d/1" },
    ]);
    await migrationService.commit({ format: "csv", content }, owner);

    expect(h.documentRepo.upsertByLegacyId).toHaveBeenCalledTimes(1);
    const [legacyId, data, tx] = h.documentRepo.upsertByLegacyId.mock.calls[0]!;
    expect(legacyId).toBe("drive-1");
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({
      candidateId: "db-L-1",
      legacyUrl: "https://d/1",
      type: "resume",
      mimeType: "application/pdf",
    });
  });

  it("never writes for error rows (unrecognized status excluded from commit)", async () => {
    const content = csv([
      { ID: "L-1", Name: "Ok", Status: NEW },
      { ID: "L-2", Name: "Bad", Status: "99 - Bogus" },
    ]);
    const report = await migrationService.commit({ format: "csv", content }, owner);
    expect(h.candidateRepo.upsertByLegacyId).toHaveBeenCalledTimes(1);
    expect(h.candidateRepo.upsertByLegacyId).toHaveBeenCalledWith(
      "L-1",
      expect.anything(),
      expect.anything(),
      h.fakeTx,
    );
    expect(report.counts.errored).toBe(1);
  });

  it("soft-deleted legacy rows → softDelete action, still upserted (lands in Trash)", async () => {
    const content =
      "ID,Name,Status,DeletedAt,DeletedBy\nL-9,Gone,0 - New Candidate,2024-01-15,u-del\n";
    const report = await migrationService.commit({ format: "csv", content }, owner);
    expect(report.counts.softDeleted).toBe(1);
    const [, create] = h.candidateRepo.upsertByLegacyId.mock.calls[0]!;
    expect(create.deletedAt).toBeInstanceOf(Date);
    expect(create.deletedById).toBe("u-del");
  });

  it("checksum mismatch → non-blocking warning (still commits)", async () => {
    const content = csv([{ ID: "L-1", Name: "Jane", Status: NEW }]);
    const report = await migrationService.commit(
      { format: "csv", content, checksum: "0".repeat(64) },
      owner,
    );
    expect(report.warnings).toContain("checksum-mismatch");
    expect(h.candidateRepo.upsertByLegacyId).toHaveBeenCalledTimes(1);
  });

  it("continues on a per-row failure and reports it errored", async () => {
    h.candidateRepo.upsertByLegacyId.mockImplementation((legacyId: string) =>
      legacyId === "L-1"
        ? Promise.reject(new Error("boom"))
        : Promise.resolve({ id: "db", legacyId }),
    );
    const content = csv([
      { ID: "L-1", Name: "Jane", Status: NEW, Email: "SEKRET-jane@x.com" },
      { ID: "L-2", Name: "John", Status: NEW },
    ]);
    const report = await migrationService.commit({ format: "csv", content }, owner);
    expect(report.counts.errored).toBe(1);
    expect(report.rows.find((r) => r.legacyId === "L-1")!.reasons).toContain("commit-failed");
    // the other row still committed
    expect(report.counts.added).toBe(1);
    assertNoPiiLogged("SEKRET-jane@x.com");
  });
});
