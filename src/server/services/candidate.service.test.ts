import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the candidate service's transition rules WITHOUT a DB: the stage gate is
 * server-authoritative (a failing gate → STAGE_BLOCKED, no writes), and an allowed `move`
 * writes the candidate update + a stage-history row + an audit row atomically (same `tx`). We
 * mock the repositories, `writeAudit`, `withTransaction` (runs the callback with a fake `tx`),
 * and `requireUser`; the pure rules (`checkStageGate`) run for real.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  owner: { id: "o1", email: "o@desta.works", name: "Owner", role: "Owner" as const },
  candidateRepo: {
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  stageRepo: { add: vi.fn(), listByCandidate: vi.fn() },
  docRepo: { listByCandidate: vi.fn() },
  noteRepo: { listByCandidate: vi.fn(), create: vi.fn() },
  clientRepo: { list: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/auth/guards", () => ({ requireUser: async () => h.user }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/stage-history.repository", () => ({
  stageHistoryRepository: h.stageRepo,
}));
vi.mock("@/server/repositories/document.repository", () => ({
  documentRepository: h.docRepo,
}));
vi.mock("@/server/repositories/note.repository", () => ({ noteRepository: h.noteRepo }));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { candidateService } from "./candidate.service";

/** A candidate row with the fields the service + rules read. */
function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    status: "NEW_CANDIDATE",
    stageOrder: 0,
    track: "Clinical",
    credential: "PMHNP",
    licenseState: "NJ",
    licenseStatus: "Active",
    population: "Adult",
    setting: "Telehealth",
    clientId: "cl1",
    email: "jane@example.com",
    phone: "555-0100",
    placedAt: null,
    ...overrides,
  };
}

/** A fuller candidate row (all date columns present) for the serialized detail projection. */
function fullCandidate(overrides: Record<string, unknown> = {}) {
  return candidate({
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    city: "Trenton",
    state: "NJ",
    employer: "Clinic",
    yearsExp: 5,
    source: "Referral",
    tags: ["Priority"],
    outreachAttempts: 0,
    licenseNumber: "LIC-SECRET-123",
    licenseExpiry: new Date("2027-01-01T00:00:00.000Z"),
    licenseVerifiedAt: null,
    licenseVerifiedById: null,
    placedAt: null,
    clientId: "cl1",
    createdById: "u1",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    stageEnteredAt: new Date("2026-06-03T00:00:00.000Z"),
    ...overrides,
  });
}

beforeEach(() => {
  h.candidateRepo.findById.mockReset();
  h.candidateRepo.update.mockReset();
  h.candidateRepo.softDelete.mockReset();
  h.stageRepo.add.mockReset();
  h.stageRepo.listByCandidate.mockReset();
  h.docRepo.listByCandidate.mockReset();
  h.noteRepo.listByCandidate.mockReset();
  h.clientRepo.list.mockReset();
  h.writeAudit.mockReset();
  // Detail composition defaults (individual tests override as needed).
  h.docRepo.listByCandidate.mockResolvedValue([]);
  h.noteRepo.listByCandidate.mockResolvedValue([]);
  h.stageRepo.listByCandidate.mockResolvedValue([]);
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Acme Health" }]);
});

describe("candidateService.move", () => {
  it("throws NOT_FOUND when the candidate does not exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.move("missing", "CLIENT_INTERVIEW", h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
  });

  it("blocks on a failing stage gate with STAGE_BLOCKED and writes nothing", async () => {
    // Clinical candidate missing credential + license state → QUALIFIED_PRESCREEN is gated.
    h.candidateRepo.findById.mockResolvedValue(candidate({ credential: null, licenseState: null }));

    await expect(
      candidateService.move("c1", "QUALIFIED_PRESCREEN", h.user as AuthUser),
    ).rejects.toMatchObject({ code: "STAGE_BLOCKED" });

    expect(h.candidateRepo.update).not.toHaveBeenCalled();
    expect(h.stageRepo.add).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("on an allowed move, writes the update + stage-history + audit in one transaction", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate());
    h.candidateRepo.update.mockResolvedValue({ id: "c1", status: "CLIENT_INTERVIEW" });

    await candidateService.move("c1", "CLIENT_INTERVIEW", h.user as AuthUser);

    // candidate update — denormalized pipeline columns, using the shared tx
    expect(h.candidateRepo.update).toHaveBeenCalledTimes(1);
    const [uid, data, utx] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("c1");
    expect(utx).toBe(h.fakeTx);
    expect(data).toMatchObject({ status: "CLIENT_INTERVIEW", stageOrder: 5 });
    expect(data.stageEnteredAt).toBeInstanceOf(Date);
    expect(data.placedAt).toBeNull(); // not STARTED_DAY1

    // stage-history row, same tx
    expect(h.stageRepo.add).toHaveBeenCalledTimes(1);
    const [histInput, htx] = h.stageRepo.add.mock.calls[0]!;
    expect(htx).toBe(h.fakeTx);
    expect(histInput).toMatchObject({
      candidateId: "c1",
      fromStatus: "NEW_CANDIDATE",
      toStatus: "CLIENT_INTERVIEW",
      fromStageOrder: 0,
      toStageOrder: 5,
      actorId: "u1",
    });

    // audit row, same tx, actor = the moving user
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, auditParams] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(auditParams).toMatchObject({
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "move",
    });
  });

  it("sets placedAt once when reaching STARTED_DAY1", async () => {
    h.candidateRepo.findById.mockResolvedValue(
      candidate({ status: "OFFER_ACCEPTED", stageOrder: 7 }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "c1" });

    await candidateService.move("c1", "STARTED_DAY1", h.user as AuthUser);

    const [, data] = h.candidateRepo.update.mock.calls[0]!;
    expect(data.placedAt).toBeInstanceOf(Date);
    expect(data.stageOrder).toBe(8);
  });

  it("preserves the original placedAt when re-entering STARTED_DAY1 (set-once)", async () => {
    const originalPlacedAt = new Date("2026-01-15T00:00:00.000Z");
    h.candidateRepo.findById.mockResolvedValue(
      // Already placed, then bounced back to OFFER_ACCEPTED, now returning to STARTED_DAY1.
      candidate({ status: "OFFER_ACCEPTED", stageOrder: 7, placedAt: originalPlacedAt }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "c1" });

    await candidateService.move("c1", "STARTED_DAY1", h.user as AuthUser);

    const [, data] = h.candidateRepo.update.mock.calls[0]!;
    expect(data.placedAt).toBe(originalPlacedAt); // NOT overwritten with now()
  });

  it("rejects an unknown pipeline status with BAD_REQUEST before any write", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate());
    await expect(
      // @ts-expect-error — exercising the runtime guard at a route-like boundary
      candidateService.move("c1", "NOT_A_REAL_STATUS", h.user as AuthUser),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
  });
});

describe("candidateService.bulkMove", () => {
  it("is partial-success: valid ids move, blocked ids are reported, NONE bypass the gate", async () => {
    // "ok" is a complete Clinical candidate; "bad" is missing credential + license state, so
    // QUALIFIED_PRESCREEN is gated for it. Both ids are attempted against the same gate.
    h.candidateRepo.findById.mockImplementation(async (id: string) =>
      id === "ok"
        ? candidate({ id: "ok" })
        : candidate({ id: "bad", credential: null, licenseState: null }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "ok", status: "QUALIFIED_PRESCREEN" });

    const result = await candidateService.bulkMove(
      ["ok", "bad"],
      "QUALIFIED_PRESCREEN",
      h.user as AuthUser,
    );

    expect(result.moved).toEqual(["ok"]);
    expect(result.blocked).toEqual([
      { id: "bad", reason: "Credential required; License state required" },
    ]);
    // Every id ran the gate (findById for both); only the allowed one wrote (no bypass, per-txn).
    expect(h.candidateRepo.findById).toHaveBeenCalledWith("ok");
    expect(h.candidateRepo.findById).toHaveBeenCalledWith("bad");
    expect(h.candidateRepo.update).toHaveBeenCalledTimes(1);
    const [uid] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("ok");
  });

  it("collects a not-found id in `blocked` instead of throwing", async () => {
    h.candidateRepo.findById.mockImplementation(async (id: string) =>
      id === "missing" ? null : candidate({ id }),
    );
    h.candidateRepo.update.mockResolvedValue({ id: "c1" });

    const result = await candidateService.bulkMove(
      ["missing", "c1"],
      "CLIENT_INTERVIEW",
      h.user as AuthUser,
    );

    expect(result.moved).toEqual(["c1"]);
    expect(result.blocked).toEqual([{ id: "missing", reason: "Candidate not found" }]);
  });
});

describe("candidateService.softDelete", () => {
  it("sets deletedAt + deletedById via the repository", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate());
    h.candidateRepo.softDelete.mockResolvedValue({ id: "c1", deletedAt: new Date() });

    await candidateService.softDelete("c1");

    expect(h.candidateRepo.softDelete).toHaveBeenCalledWith("c1", "u1");
  });

  it("throws NOT_FOUND when the candidate does not exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.softDelete("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.candidateRepo.softDelete).not.toHaveBeenCalled();
  });
});

/** A document row with the sensitive extraction fields, for the PII-gate assertions. */
function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    legacyId: null,
    candidateId: "c1",
    type: "resume",
    originalFilename: "jane-resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    storageKey: null,
    legacyUrl: "https://drive.example/xyz",
    extractedText: "SSN 000-00-0000 and license LIC-SECRET-123",
    extractedData: { npi: "1234567890" },
    uploadedById: "u1",
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

describe("candidateService.getCandidateDetail", () => {
  it("composes candidate + documents + notes + recent history + clientName", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.docRepo.listByCandidate.mockResolvedValue([documentRow()]);
    h.noteRepo.listByCandidate.mockResolvedValue([
      {
        id: "n1",
        body: "call back",
        noteType: "internal",
        authorId: "u1",
        authorName: "Test User",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ]);
    h.stageRepo.listByCandidate.mockResolvedValue([
      {
        id: "s1",
        fromStatus: null,
        toStatus: "NEW_CANDIDATE",
        fromStageOrder: null,
        toStageOrder: 0,
        enteredAt: new Date("2026-06-03T00:00:00.000Z"),
        actorId: "u1",
      },
    ]);

    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);

    expect(detail.clientName).toBe("Acme Health");
    expect(detail.candidate.id).toBe("c1");
    expect(detail.candidate.createdAt).toBe("2026-06-01T00:00:00.000Z");
    expect(detail.documents).toHaveLength(1);
    expect(detail.documents[0]!.originalFilename).toBe("jane-resume.pdf");
    expect(detail.notes).toEqual([
      {
        id: "n1",
        body: "call back",
        noteType: "internal",
        authorId: "u1",
        authorName: "Test User",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
    expect(detail.stageHistory).toHaveLength(1);
    expect(detail.stageHistory[0]!.toStatus).toBe("NEW_CANDIDATE");
  });

  it("PII gate: a viewCredentials viewer sees licenseNumber + extractedText", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.docRepo.listByCandidate.mockResolvedValue([documentRow()]);

    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);

    expect(detail.canVerifyCredentials).toBe(true);
    expect(detail.candidate.licenseNumber).toBe("LIC-SECRET-123");
    expect(detail.documents[0]!.extractedText).toContain("LIC-SECRET-123");
    expect(detail.documents[0]!.extractedData).toEqual({ npi: "1234567890" });
  });

  it("PII gate: a non-capability viewer sees NEITHER licenseNumber NOR extractedText", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.docRepo.listByCandidate.mockResolvedValue([documentRow()]);

    const detail = await candidateService.getCandidateDetail("c1", h.user as AuthUser);

    expect(detail.canVerifyCredentials).toBe(false);
    expect("licenseNumber" in detail.candidate).toBe(false);
    expect("extractedText" in detail.documents[0]!).toBe(false);
    expect("extractedData" in detail.documents[0]!).toBe(false);
    // The secret never crosses the wire at all.
    expect(JSON.stringify(detail)).not.toContain("LIC-SECRET-123");
  });

  it("caps stage history at the 10 most recent", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.stageRepo.listByCandidate.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => ({
        id: `s${i}`,
        fromStatus: null,
        toStatus: "NEW_CANDIDATE",
        fromStageOrder: null,
        toStageOrder: 0,
        enteredAt: new Date("2026-06-03T00:00:00.000Z"),
        actorId: "u1",
      })),
    );
    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);
    expect(detail.stageHistory).toHaveLength(10);
  });

  it("null clientName when the candidate has no client", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate({ clientId: null }));
    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);
    expect(detail.clientName).toBeNull();
  });

  it("throws NOT_FOUND when the candidate is missing/soft-deleted", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.getCandidateDetail("missing", h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("candidateService.update", () => {
  it("maps profile fields to the repo update and audits the CHANGED keys in one txn", async () => {
    const existing = fullCandidate({ name: "Old Name", city: "Newark" });
    h.candidateRepo.findById.mockResolvedValue(existing);
    h.candidateRepo.update.mockResolvedValue(fullCandidate({ name: "New Name", city: "Trenton" }));

    await candidateService.update("c1", { name: "New Name", city: "Trenton" }, h.owner as AuthUser);

    // repo update — the exact profile input, on the shared tx.
    expect(h.candidateRepo.update).toHaveBeenCalledTimes(1);
    const [uid, data, utx] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("c1");
    expect(utx).toBe(h.fakeTx);
    expect(data).toEqual({ name: "New Name", city: "Trenton" });

    // audit — before/after narrowed to the changed keys only (never the whole row).
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, params] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(params).toMatchObject({
      entity: "candidate",
      entityId: "c1",
      actor: "o1",
      action: "update",
    });
    expect(params.before).toEqual({ name: "Old Name", city: "Newark" });
    expect(params.after).toEqual({ name: "New Name", city: "Trenton" });
  });

  it("throws NOT_FOUND when the candidate is missing and writes nothing", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.update("missing", { name: "X" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("candidateService.verifyLicense", () => {
  it("sets licenseStatus + verifiedAt + verifiedById and audits verify_license in one txn", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate({ licenseStatus: "Not Verified" }));
    h.candidateRepo.update.mockResolvedValue(fullCandidate({ licenseStatus: "Active" }));

    await candidateService.verifyLicense("c1", { licenseStatus: "Active" }, h.user as AuthUser);

    expect(h.candidateRepo.update).toHaveBeenCalledTimes(1);
    const [uid, data, utx] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("c1");
    expect(utx).toBe(h.fakeTx);
    expect(data.licenseStatus).toBe("Active");
    expect(data.licenseVerifiedById).toBe("u1"); // a no-capability operator CAN verify
    expect(data.licenseVerifiedAt).toBeInstanceOf(Date);
    // No licenseNumber/expiry keys when not provided (leaves them untouched).
    expect("licenseNumber" in data).toBe(false);
    expect("licenseExpiry" in data).toBe(false);

    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [, params] = h.writeAudit.mock.calls[0]!;
    expect(params).toMatchObject({ action: "verify_license", actor: "u1", entityId: "c1" });
  });

  it("carries optional expiry + number through when provided", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.candidateRepo.update.mockResolvedValue(fullCandidate({ licenseStatus: "Active" }));
    const expiry = new Date("2028-01-01T00:00:00.000Z");

    await candidateService.verifyLicense(
      "c1",
      { licenseStatus: "Active", licenseExpiry: expiry, licenseNumber: "LIC-999" },
      h.owner as AuthUser,
    );

    const [, data] = h.candidateRepo.update.mock.calls[0]!;
    expect(data.licenseExpiry).toBe(expiry);
    expect(data.licenseNumber).toBe("LIC-999");
  });

  it("throws NOT_FOUND when the candidate is missing", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.verifyLicense("missing", { licenseStatus: "Active" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
  });
});
