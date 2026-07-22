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
    restore: vi.fn(),
    purge: vi.fn(),
    listDeleted: vi.fn(),
    incrementOutreach: vi.fn(),
  },
  outreachRepo: { listForCandidate: vi.fn(), createForCandidate: vi.fn() },
  leadRepo: { findByPromotedCandidateId: vi.fn() },
  stageRepo: { add: vi.fn(), listByCandidate: vi.fn() },
  docRepo: { listByCandidate: vi.fn() },
  noteRepo: { listByCandidate: vi.fn(), create: vi.fn() },
  clientRepo: {
    list: vi.fn(),
    nameMap: async () => {
      const clients = await h.clientRepo.list();
      return new Map(clients.map((c: { id: string; name: string }) => [c.id, c.name]));
    },
  },
  clientRulesRepo: { list: vi.fn() },
  userRepo: { namesByIds: vi.fn() },
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
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@/server/repositories/outreach.repository", () => ({
  outreachRepository: h.outreachRepo,
}));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: h.leadRepo }));
vi.mock("@/server/repositories/client-rules.repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/server/repositories/client-rules.repository")
  >("@/server/repositories/client-rules.repository");
  return { ...actual, clientRulesRepository: h.clientRulesRepo };
});
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
  h.candidateRepo.restore.mockReset();
  h.candidateRepo.purge.mockReset();
  h.candidateRepo.listDeleted.mockReset();
  h.candidateRepo.incrementOutreach.mockReset();
  h.outreachRepo.listForCandidate.mockReset();
  h.outreachRepo.createForCandidate.mockReset();
  h.outreachRepo.listForCandidate.mockResolvedValue([]);
  h.leadRepo.findByPromotedCandidateId.mockReset();
  h.leadRepo.findByPromotedCandidateId.mockResolvedValue(null);
  h.userRepo.namesByIds.mockReset();
  h.userRepo.namesByIds.mockResolvedValue(new Map());
  h.stageRepo.add.mockReset();
  h.stageRepo.listByCandidate.mockReset();
  h.docRepo.listByCandidate.mockReset();
  h.noteRepo.listByCandidate.mockReset();
  h.clientRepo.list.mockReset();
  h.clientRulesRepo.list.mockReset();
  h.writeAudit.mockReset();
  // Detail composition defaults (individual tests override as needed).
  h.docRepo.listByCandidate.mockResolvedValue([]);
  h.noteRepo.listByCandidate.mockResolvedValue([]);
  h.stageRepo.listByCandidate.mockResolvedValue([]);
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Acme Health" }]);
  // No rules by default → detail `scoring` is null; scoring tests override with a rules row.
  h.clientRulesRepo.list.mockResolvedValue([]);
});

/** A `client_rules` row for `cl1` = Acme Health, matched to `fullCandidate` (NJ / PMHNP). */
function acmeRules(overrides: Record<string, unknown> = {}) {
  return {
    id: "r1",
    clientId: "cl1",
    states: ["NJ"],
    creds: ["PMHNP", "MD"],
    pops: [],
    settings: [],
    priority: "MED",
    autoDisqualify: [],
    ...overrides,
  };
}

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
  it("sets deletedAt + deletedById via the repository AND writes a `delete` audit in one txn", async () => {
    const deletedAt = new Date();
    h.candidateRepo.findById.mockResolvedValue(candidate({ status: "CLIENT_INTERVIEW" }));
    h.candidateRepo.softDelete.mockResolvedValue({ id: "c1", deletedAt });

    await candidateService.softDelete("c1");

    // repo mutation runs on the shared tx
    const [sid, actor, stx] = h.candidateRepo.softDelete.mock.calls[0]!;
    expect(sid).toBe("c1");
    expect(actor).toBe("u1");
    expect(stx).toBe(h.fakeTx);

    // audit row, same tx, action "delete"
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, auditParams] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(auditParams).toMatchObject({
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "delete",
    });
  });

  it("throws NOT_FOUND when the candidate is missing or already deleted (idempotent)", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.softDelete("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.candidateRepo.softDelete).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("candidateService.restore", () => {
  it("restores a trashed candidate and writes a `restore` audit (status untouched)", async () => {
    h.candidateRepo.findById.mockResolvedValue(
      candidate({ status: "CLIENT_INTERVIEW", deletedAt: new Date(), deletedById: "u9" }),
    );
    h.candidateRepo.restore.mockResolvedValue({ id: "c1", status: "CLIENT_INTERVIEW" });

    await candidateService.restore("c1", h.owner as AuthUser);

    // loads WITH includeDeleted (default read excludes trashed rows)
    expect(h.candidateRepo.findById).toHaveBeenCalledWith("c1", { includeDeleted: true });
    const [rid, rtx] = h.candidateRepo.restore.mock.calls[0]!;
    expect(rid).toBe("c1");
    expect(rtx).toBe(h.fakeTx);
    const [atx, auditParams] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(auditParams).toMatchObject({ action: "restore", entityId: "c1", actor: "o1" });
  });

  it("throws CONFLICT restoring a live (non-trashed) candidate", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate({ deletedAt: null }));
    await expect(candidateService.restore("c1", h.owner as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.candidateRepo.restore).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the candidate does not exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.restore("missing", h.owner as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.candidateRepo.restore).not.toHaveBeenCalled();
  });
});

describe("candidateService.purge", () => {
  it("requires purgeCandidate — a non-holder gets FORBIDDEN and the candidate is untouched", async () => {
    // h.user is an Associate (no purgeCandidate). Guard fires BEFORE any read/mutation.
    await expect(candidateService.purge("c1", h.user as AuthUser)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(h.candidateRepo.findById).not.toHaveBeenCalled();
    expect(h.candidateRepo.purge).not.toHaveBeenCalled();
  });

  it("throws CONFLICT purging a live (non-trashed) candidate (two-step gate)", async () => {
    h.candidateRepo.findById.mockResolvedValue(candidate({ deletedAt: null }));
    await expect(candidateService.purge("c1", h.owner as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.candidateRepo.purge).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the candidate does not exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.purge("missing", h.owner as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.candidateRepo.purge).not.toHaveBeenCalled();
  });

  it("for an Owner on a trashed candidate: cascades (repo.purge) + writes a `purge` audit in one txn", async () => {
    h.candidateRepo.findById.mockResolvedValue(
      candidate({ name: "Jane Doe", deletedAt: new Date() }),
    );
    h.candidateRepo.purge.mockResolvedValue({ id: "c1" });

    const result = await candidateService.purge("c1", h.owner as AuthUser);
    expect(result).toEqual({ id: "c1" });

    // audit is written BEFORE the delete, same tx (survives the cascade — no FK)
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, auditParams] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(auditParams).toMatchObject({ action: "purge", entityId: "c1", actor: "o1" });
    const [pid, ptx] = h.candidateRepo.purge.mock.calls[0]!;
    expect(pid).toBe("c1");
    expect(ptx).toBe(h.fakeTx);
    // audit ordering: writeAudit invoked before repo.purge
    expect(h.writeAudit.mock.invocationCallOrder[0]!).toBeLessThan(
      h.candidateRepo.purge.mock.invocationCallOrder[0]!,
    );
  });
});

describe("candidateService.listTrash", () => {
  it("returns only soft-deleted candidates, PII-gated, with deletedByName resolved", async () => {
    const deletedAt = new Date("2026-07-02T00:00:00.000Z");
    h.candidateRepo.listDeleted.mockResolvedValue([
      {
        id: "c1",
        name: "Jane Doe",
        credential: "PMHNP",
        status: "CLIENT_INTERVIEW",
        clientId: "cl1",
        licenseNumber: "LIC-SECRET",
        deletedAt,
        deletedById: "u9",
      },
    ]);
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u9", "Deleter Person"]]));

    // Viewer WITHOUT viewCredentials (Associate) → licenseNumber must be gated out.
    const trash = await candidateService.listTrash(h.user as AuthUser);

    expect(h.candidateRepo.listDeleted).toHaveBeenCalledTimes(1);
    // single batched name lookup for the actor ids
    expect(h.userRepo.namesByIds).toHaveBeenCalledWith(["u9"]);
    expect(trash.items).toEqual([
      {
        id: "c1",
        name: "Jane Doe",
        credential: "PMHNP",
        clientName: "Acme Health",
        status: "CLIENT_INTERVIEW",
        statusLabel: expect.any(String),
        deletedAt: "2026-07-02T00:00:00.000Z",
        deletedByName: "Deleter Person",
      },
    ]);
    expect(JSON.stringify(trash)).not.toContain("LIC-SECRET");
  });

  it("falls back to null deletedByName when the actor is unknown / removed", async () => {
    h.candidateRepo.listDeleted.mockResolvedValue([
      {
        id: "c2",
        name: "John Roe",
        credential: null,
        status: "NEW_CANDIDATE",
        clientId: null,
        deletedAt: new Date("2026-07-03T00:00:00.000Z"),
        deletedById: "gone",
      },
    ]);
    h.userRepo.namesByIds.mockResolvedValue(new Map());

    const trash = await candidateService.listTrash(h.owner as AuthUser);
    expect(trash.items[0]!.deletedByName).toBeNull();
    expect(trash.items[0]!.clientName).toBeNull();
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

describe("candidateService.getProfile", () => {
  it("returns just the PII-gated profile fields (no documents/notes/history/outreach reads)", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());

    const profile = await candidateService.getProfile("c1", h.owner as AuthUser);

    expect(profile.id).toBe("c1");
    expect(profile.email).toBeDefined();
    expect(h.docRepo.listByCandidate).not.toHaveBeenCalled();
    expect(h.noteRepo.listByCandidate).not.toHaveBeenCalled();
    expect(h.outreachRepo.listForCandidate).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for a missing candidate", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(candidateService.getProfile("nope", h.owner as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

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

  it("attaches a scoring block (pct/score/max/flags) for a client-assigned candidate", async () => {
    // NJ / PMHNP / Active vs NJ+PMHNP rules → state 30 + cred 30 + license 10 = 70/70 → pct 100.
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.clientRulesRepo.list.mockResolvedValue([acmeRules()]);
    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);
    expect(detail.scoring).not.toBeNull();
    expect(detail.scoring!.pct).toBe(100);
    expect(detail.scoring!.max).toBe(70);
    expect(Array.isArray(detail.scoring!.flags)).toBe(true);
    expect(detail.scoring!.flags).toHaveLength(0);
    expect(detail.scoring!.autoDisqualify).toEqual([]);
  });

  it("populates scoring.autoDisqualify (advisory) for an expired-license candidate", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate({ licenseStatus: "Expired" }));
    h.clientRulesRepo.list.mockResolvedValue([acmeRules()]);
    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);
    expect(detail.scoring!.autoDisqualify).toContain("License expired");
    expect(detail.scoring!.flags).toContain("License expired");
  });

  it("scoring is null when the candidate has no client", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate({ clientId: null }));
    h.clientRulesRepo.list.mockResolvedValue([acmeRules()]);
    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);
    expect(detail.scoring).toBeNull();
  });

  it("scoring is null when the assigned client has no rules row", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.clientRulesRepo.list.mockResolvedValue([]); // no rules seeded
    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);
    expect(detail.scoring).toBeNull();
  });

  it("includes the outreach log (serialized, actor names batch-resolved)", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.outreachRepo.listForCandidate.mockResolvedValue([
      {
        id: "a1",
        channel: "phone",
        at: new Date("2026-07-01T12:00:00.000Z"),
        note: "Left a voicemail",
        actorId: "u1",
      },
      {
        id: "a2",
        channel: "email",
        at: new Date("2026-06-20T09:00:00.000Z"),
        note: null,
        actorId: "u2",
      },
    ]);
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u1", "Test User"]]));

    const detail = await candidateService.getCandidateDetail("c1", h.owner as AuthUser);

    expect(h.outreachRepo.listForCandidate).toHaveBeenCalledWith("c1");
    expect(h.userRepo.namesByIds).toHaveBeenCalledWith(["u1", "u2"]);
    expect(detail.outreach).toEqual([
      {
        id: "a1",
        channel: "phone",
        at: "2026-07-01T12:00:00.000Z",
        note: "Left a voicemail",
        actorId: "u1",
        actorName: "Test User",
      },
      {
        id: "a2",
        channel: "email",
        at: "2026-06-20T09:00:00.000Z",
        note: null,
        actorId: "u2",
        actorName: null, // unknown/removed actor → null, never a crash
      },
    ]);
  });
});

describe("candidateService.logOutreach", () => {
  it("inserts the attempt + bumps the counter + audits atomically (same tx)", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.outreachRepo.createForCandidate.mockResolvedValue({
      id: "a1",
      channel: "phone",
      at: new Date("2026-07-10T10:00:00.000Z"),
      note: "Left a voicemail",
      actorId: "u1",
    });
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u1", "Test User"]]));

    const dto = await candidateService.logOutreach(
      "c1",
      { channel: "phone", note: "Left a voicemail" },
      h.user as AuthUser,
    );

    // insert — actor from the SESSION user, on the shared tx.
    expect(h.outreachRepo.createForCandidate).toHaveBeenCalledWith(
      "c1",
      { channel: "phone", note: "Left a voicemail", actorId: "u1", templateId: null },
      h.fakeTx,
    );
    // denormalized counter bumped in the same tx.
    expect(h.candidateRepo.incrementOutreach).toHaveBeenCalledWith("c1", h.fakeTx);
    // audit row (same tx) — channel + attempt id, no note PII in the audit payload.
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, params] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(params).toMatchObject({
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "log_outreach",
      after: { channel: "phone", attemptId: "a1" },
    });
    // returned DTO is serialized + actor-name-resolved for in-place prepend.
    expect(dto).toEqual({
      id: "a1",
      channel: "phone",
      at: "2026-07-10T10:00:00.000Z",
      note: "Left a voicemail",
      actorId: "u1",
      actorName: "Test User",
    });
  });

  it("throws NOT_FOUND (no writes) when the candidate is missing/soft-deleted", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      candidateService.logOutreach("missing", { channel: "email" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.outreachRepo.createForCandidate).not.toHaveBeenCalled();
    expect(h.candidateRepo.incrementOutreach).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
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

describe("candidateService.getJourney", () => {
  it("composes sourced → promoted → stage → note → outreach, oldest first, with spanDays", async () => {
    h.candidateRepo.findById.mockResolvedValue(
      fullCandidate({ createdAt: new Date("2026-06-25T10:00:00.000Z") }),
    );
    h.leadRepo.findByPromotedCandidateId.mockResolvedValue({
      id: "l1",
      source: "linkedIn",
      clientId: "cl1",
      createdById: "u2",
      createdAt: new Date("2026-06-20T00:00:00.000Z"),
    });
    h.stageRepo.listByCandidate.mockResolvedValue([
      {
        id: "s1",
        fromStatus: "NEW_CANDIDATE",
        toStatus: "QUALIFIED",
        enteredAt: new Date("2026-06-26T00:00:00.000Z"),
        actorId: "u1",
      },
    ]);
    h.noteRepo.listByCandidate.mockResolvedValue([
      {
        id: "n1",
        body: "@Biruh Test",
        noteType: "internal",
        authorId: "u1",
        authorName: "Test User",
        createdAt: new Date("2026-06-26T01:00:00.000Z"),
      },
    ]);
    h.outreachRepo.listForCandidate.mockResolvedValue([
      {
        id: "a1",
        channel: "email",
        at: new Date("2026-06-27T00:00:00.000Z"),
        note: "Template sent",
        actorId: "u1",
      },
    ]);
    h.userRepo.namesByIds.mockResolvedValue(
      new Map([
        ["u1", "Test User"],
        ["u2", "Michael Habtom"],
      ]),
    );

    const journey = await candidateService.getJourney("c1", h.owner as AuthUser);

    expect(journey.events.map((e) => e.kind)).toEqual([
      "sourced",
      "promoted",
      "stage",
      "note",
      "outreach",
    ]);
    expect(journey.events[0]).toMatchObject({
      actorName: "Michael Habtom",
      detail: "linkedIn · target Acme Health",
    });
    // Stage codes render as display labels (unknown codes fall back to the raw string).
    expect(journey.events[2]!.detail).toBe("New Candidate → QUALIFIED");
    expect(journey.events[3]).toMatchObject({ noteType: "internal", detail: "@Biruh Test" });
    expect(journey.events[4]).toMatchObject({ channel: "email", detail: "Template sent" });
    expect(journey.spanDays).toBe(7); // Jun 20 → Jun 27
  });

  it("applies note VISIBILITY (an Associate never sees non-internal notes in the journey)", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    h.noteRepo.listByCandidate.mockResolvedValue([
      {
        id: "n1",
        body: "internal ok",
        noteType: "internal",
        authorId: "u1",
        authorName: "Test User",
        createdAt: new Date("2026-06-26T01:00:00.000Z"),
      },
      {
        id: "n2",
        body: "client-only secret",
        noteType: "client",
        authorId: "u1",
        authorName: "Test User",
        createdAt: new Date("2026-06-26T02:00:00.000Z"),
      },
    ]);

    const journey = await candidateService.getJourney("c1", h.user as AuthUser);
    const notes = journey.events.filter((e) => e.kind === "note");
    expect(notes).toHaveLength(1);
    expect(notes[0]!.detail).toBe("internal ok");
  });

  it("a candidate with no lead gets a 'created' origin event instead", async () => {
    h.candidateRepo.findById.mockResolvedValue(fullCandidate());
    const journey = await candidateService.getJourney("c1", h.owner as AuthUser);
    expect(journey.events[0]).toMatchObject({ kind: "created", detail: "Referral" });
    expect(journey.events.some((e) => e.kind === "sourced" || e.kind === "promoted")).toBe(false);
  });
});
