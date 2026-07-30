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
  candidateRepo: { list: vi.fn(), upsertByLegacyId: vi.fn(), findById: vi.fn(), update: vi.fn() },
  documentRepo: { upsertByLegacyId: vi.fn(), create: vi.fn() },
  writeAudit: vi.fn(),
  parseResume: vi.fn(),
  checkRateLimit: vi.fn(),
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
vi.mock("@/server/ai/parse-resume", () => ({ parseResume: h.parseResume }));
vi.mock("@/server/http/rate-limit", () => ({ checkRateLimit: h.checkRateLimit }));

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
  h.documentRepo.create.mockReset().mockResolvedValue({ id: "doc-ai-1" });
  h.candidateRepo.findById.mockReset().mockResolvedValue({ id: "db-L-1", name: "Jane" });
  h.candidateRepo.update.mockReset().mockResolvedValue({ id: "db-L-1" });
  h.parseResume.mockReset();
  h.checkRateLimit.mockReset();
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

/** A minimal but shape-valid clinical résumé extraction, for mocking `parseResume`. */
const FAKE_RESUME_DATA = {
  name: "Jane Doe",
  email: "jane.new@x.com",
  phone: "555-1234",
  homeBase: { city: "Austin", stateOrCountry: "TX", timezone: "CT" },
  workMode: "Remote",
  targetStart: null,
  snapshot: "",
  verificationLine: "",
  experience: [
    {
      title: "RN",
      dates: "",
      employer: "Acme Health",
      setting: "Outpatient",
      location: "",
      contextLine: "",
      bullets: [],
    },
  ],
  education: [],
  licensure: [
    { type: "PMHNP", state: "TX", number: "12345", status: "Active", expires: "Jan 2027" },
  ],
  npi: null,
  caqhAttestedDate: null,
  skills: { modalities: [], populations: ["Adult"] },
};

describe("migrationService — résumé ZIP matching (Wave 1.3 backlog, Indrasur flow)", () => {
  it("matches a résumé to its row by normalized name, unmatched files are surfaced (never dropped)", async () => {
    const content = csv([
      { ID: "L-1", Name: "Jane Doe", Status: NEW },
      { ID: "L-2", Name: "No Resume Here", Status: NEW },
    ]);
    const report = await migrationService.prepare(
      {
        format: "csv",
        content,
        resumes: [
          {
            filenamePrefix: "Jane Doe",
            originalFilename: "Jane Doe.pdf",
            text: "resume text for jane",
          },
          {
            filenamePrefix: "Someone Else",
            originalFilename: "Someone Else.pdf",
            text: "orphaned resume text",
          },
        ],
      },
      owner,
    );
    expect(report.rows.find((r) => r.legacyId === "L-1")!.resumeMatch).toBe("matched");
    expect(report.rows.find((r) => r.legacyId === "L-1")!.resumeFilename).toBe("Jane Doe.pdf");
    expect(report.rows.find((r) => r.legacyId === "L-2")!.resumeMatch).toBe("none");
    expect(report.unmatchedResumeFiles).toEqual(["Someone Else.pdf"]);
    expect(report.resumeCounts).toEqual({ matched: 1, ambiguous: 0, none: 1 });
  });

  it("a row with no résumé still imports normally (never hard-blocked, unlike legacy)", async () => {
    const content = csv([{ ID: "L-1", Name: "No Resume", Status: NEW }]);
    const report = await migrationService.prepare(
      {
        format: "csv",
        content,
        resumes: [
          {
            filenamePrefix: "Somebody Else",
            originalFilename: "Somebody Else.pdf",
            text: "x".repeat(60),
          },
        ],
      },
      owner,
    );
    expect(report.rows[0]!.action).toBe("add");
    expect(report.rows[0]!.resumeMatch).toBe("none");
  });

  it("collision — >1 résumé file for one name → ambiguous for every affected row, no silent overwrite", async () => {
    const content = csv([{ ID: "L-1", Name: "Jane Doe", Status: NEW }]);
    const report = await migrationService.prepare(
      {
        format: "csv",
        content,
        resumes: [
          { filenamePrefix: "Jane Doe", originalFilename: "Jane Doe.pdf", text: "resume A" },
          { filenamePrefix: "jane doe", originalFilename: "jane doe.pdf", text: "resume B" }, // same normalized key
        ],
      },
      owner,
    );
    expect(report.rows[0]!.resumeMatch).toBe("ambiguous");
    expect(report.rows[0]!.reasons).toContain("resume-ambiguous");
  });

  it("collision — >1 row sharing a name with exactly 1 résumé → ambiguous for both rows", async () => {
    const content = csv([
      { ID: "L-1", Name: "Same Name", Status: NEW },
      { ID: "L-2", Name: "Same Name", Status: NEW },
    ]);
    const report = await migrationService.prepare(
      {
        format: "csv",
        content,
        resumes: [
          { filenamePrefix: "Same Name", originalFilename: "Same Name.pdf", text: "one resume" },
        ],
      },
      owner,
    );
    expect(report.rows.every((r) => r.resumeMatch === "ambiguous")).toBe(true);
  });

  it('no ZIP uploaded at all → every row reports resumeMatch "none", no unmatchedResumeFiles/resumeCounts', async () => {
    const content = csv([{ ID: "L-1", Name: "Jane", Status: NEW }]);
    const report = await migrationService.prepare({ format: "csv", content }, owner);
    expect(report.rows[0]!.resumeMatch).toBe("none");
    expect(report.unmatchedResumeFiles).toBeUndefined();
    expect(report.resumeCounts).toBeUndefined();
  });
});

describe("migrationService.commit — AI résumé extraction (Wave 1.3 backlog, Indrasur flow)", () => {
  it("extractWithAi=false (default) never calls parseResume even when a résumé matched", async () => {
    const content = csv([{ ID: "L-1", Name: "Jane Doe", Status: NEW }]);
    await migrationService.commit(
      {
        format: "csv",
        content,
        resumes: [
          { filenamePrefix: "Jane Doe", originalFilename: "Jane Doe.pdf", text: "resume text" },
        ],
      },
      owner,
    );
    expect(h.parseResume).not.toHaveBeenCalled();
    expect(h.documentRepo.create).not.toHaveBeenCalled();
  });

  it("extractWithAi=true + matched résumé → parseResume called, Document created, empty fields filled", async () => {
    h.parseResume.mockResolvedValue(FAKE_RESUME_DATA);
    h.candidateRepo.findById.mockResolvedValue({
      id: "db-L-1",
      name: "Jane Doe",
      email: null,
      phone: null,
    });

    const content = csv([{ ID: "L-1", Name: "Jane Doe", Status: NEW }]);
    await migrationService.commit(
      {
        format: "csv",
        content,
        resumes: [
          {
            filenamePrefix: "Jane Doe",
            originalFilename: "Jane Doe.pdf",
            text: "resume text for jane",
          },
        ],
        extractWithAi: true,
      },
      owner,
    );

    expect(h.checkRateLimit).toHaveBeenCalledWith(
      "migration-resume-ai:u1",
      expect.objectContaining({ limit: 20 }),
    );
    expect(h.parseResume).toHaveBeenCalledWith({
      variant: "clinical",
      text: "resume text for jane",
    });
    expect(h.documentRepo.create).toHaveBeenCalledTimes(1);
    const [docData] = h.documentRepo.create.mock.calls[0]!;
    expect(docData).toMatchObject({
      candidateId: "db-L-1",
      type: "resume",
      extractedText: "resume text for jane",
    });
    // email/phone were empty on the existing candidate → filled from the extraction
    expect(h.candidateRepo.update).toHaveBeenCalledWith(
      "db-L-1",
      expect.objectContaining({ email: "jane.new@x.com" }),
      h.fakeTx,
    );
  });

  it("never overwrites an existing (non-empty) candidate field", async () => {
    h.parseResume.mockResolvedValue(FAKE_RESUME_DATA);
    h.candidateRepo.findById.mockResolvedValue({
      id: "db-L-1",
      name: "Jane Doe",
      email: "already-set@x.com",
      phone: null,
    });

    const content = csv([{ ID: "L-1", Name: "Jane Doe", Status: NEW }]);
    await migrationService.commit(
      {
        format: "csv",
        content,
        resumes: [
          { filenamePrefix: "Jane Doe", originalFilename: "Jane Doe.pdf", text: "resume text" },
        ],
        extractWithAi: true,
      },
      owner,
    );

    const fills = h.candidateRepo.update.mock.calls[0]?.[1] as Record<string, unknown> | undefined;
    expect(fills?.email).toBeUndefined(); // NOT overwritten
    expect(fills?.phone).toBe("555-1234"); // empty field WAS filled
  });

  it("a failed extraction marks the row (not the whole batch) and the candidate is still committed", async () => {
    h.parseResume.mockRejectedValue(new Error("provider down"));
    const content = csv([{ ID: "L-1", Name: "Jane Doe", Status: NEW }]);
    const report = await migrationService.commit(
      {
        format: "csv",
        content,
        resumes: [
          { filenamePrefix: "Jane Doe", originalFilename: "Jane Doe.pdf", text: "resume text" },
        ],
        extractWithAi: true,
      },
      owner,
    );
    expect(report.rows[0]!.action).toBe("add"); // candidate itself still committed
    expect(report.rows[0]!.reasons).toContain("ai-extraction-failed");
    expect(h.documentRepo.create).not.toHaveBeenCalled();
  });

  it("ambiguous/unmatched rows never trigger AI extraction even with extractWithAi=true", async () => {
    const content = csv([
      { ID: "L-1", Name: "Same Name", Status: NEW },
      { ID: "L-2", Name: "Same Name", Status: NEW },
      { ID: "L-3", Name: "No Resume", Status: NEW },
    ]);
    await migrationService.commit(
      {
        format: "csv",
        content,
        resumes: [
          { filenamePrefix: "Same Name", originalFilename: "Same Name.pdf", text: "one resume" },
        ],
        extractWithAi: true,
      },
      owner,
    );
    expect(h.parseResume).not.toHaveBeenCalled();
  });
});
