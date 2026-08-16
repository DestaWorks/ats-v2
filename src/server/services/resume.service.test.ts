import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";
import type { ClinicalResume } from "@/lib/validation/resume";

/**
 * Resume service tests (§8) WITHOUT a DB or real Claude: `extract` returns data + the server match;
 * `save` recomputes the match server-side and, in ONE transaction, attaches (auto/confirm) or
 * creates, persists the document, and audits. The pure match + mapper run for real; repositories,
 * `parseResume`, `writeAudit`, and `withTransaction` are mocked. Also asserts no PII is logged.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  parseResume: vi.fn(),
  candidateRepo: {
    list: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
  },
  documentRepo: { create: vi.fn(), findById: vi.fn() },
  writeAudit: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/parse-resume", () => ({ parseResume: h.parseResume }));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: { ...h.candidateRepo, listForMatch: h.candidateRepo.list },
}));
vi.mock("@/server/repositories/document.repository", () => ({
  documentRepository: h.documentRepo,
}));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));
vi.mock("@/server/integrations/storage", () => ({
  RESUME_BUCKET: "resumes",
  createSignedUploadUrl: h.createSignedUploadUrl,
  getSignedDownloadUrl: h.getSignedDownloadUrl,
}));

import { resumeService } from "./resume.service";

/** A complete, schema-valid clinical resume (save re-validates `data`). */
function clinicalData(overrides: Partial<ClinicalResume> = {}): ClinicalResume {
  return {
    name: "Jane Doe",
    headerRole: "Licensed Professional Counselor",
    email: "jane@example.com",
    phone: "(555) 555-0100",
    homeBase: { city: "Austin", stateOrCountry: "TX", timezone: "CT" },
    workMode: "Telehealth",
    targetStart: "Negotiable",
    snapshot: "Snapshot with a secret licenseNumber LPC-SECRET-99 inside.",
    verificationLine: "TX BHEC; NPI via NPPES",
    experience: [
      {
        title: "Therapist",
        dates: "Jan 2020 – Present",
        employer: "Acme Health",
        setting: "Outpatient",
        location: "Austin, TX",
        contextLine: "Caseload of 40",
        bullets: ["Did a thing"],
      },
    ],
    education: [{ degree: "MS", school: "UT", location: "Austin, TX", year: "2018", honor: "" }],
    licensure: [
      {
        type: "Licensed Professional Counselor",
        state: "TX",
        number: "LPC-SECRET-99",
        status: "Active",
        expires: "May 2027",
      },
    ],
    npi: "1234567890",
    caqhAttestedDate: "May 2026",
    skills: { modalities: ["CBT"], populations: ["Adults"] },
    ...overrides,
  };
}

function saveInput(overrides: Record<string, unknown> = {}) {
  return {
    variant: "clinical" as const,
    data: clinicalData() as unknown as Record<string, unknown>,
    originalFilename: "jane.pdf",
    mimeType: "application/pdf",
    extractedText: "raw resume text with LPC-SECRET-99",
    ...overrides,
  };
}

let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  h.parseResume.mockReset();
  h.candidateRepo.list.mockReset();
  h.candidateRepo.findById.mockReset();
  h.candidateRepo.update.mockReset();
  h.candidateRepo.create.mockReset();
  h.documentRepo.create.mockReset();
  h.documentRepo.findById.mockReset();
  h.writeAudit.mockReset();
  h.createSignedUploadUrl.mockReset();
  h.getSignedDownloadUrl.mockReset();
  h.documentRepo.create.mockResolvedValue({ id: "d1", candidateId: "x", type: "resume" });
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

function assertNoPiiLogged() {
  for (const spy of [errorSpy, logSpy]) {
    for (const call of spy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("LPC-SECRET-99");
    }
  }
}

describe("resumeService.extract", () => {
  it("returns the parsed data + the server-computed match (none on empty pipeline)", async () => {
    h.parseResume.mockResolvedValue(clinicalData());
    h.candidateRepo.list.mockResolvedValue([]);

    const result = await resumeService.extract({ variant: "clinical", text: "x".repeat(60) });

    expect(result.variant).toBe("clinical");
    expect(result.match).toEqual({ status: "none", score: 0 });
    assertNoPiiLogged();
  });

  it("computes an auto match when an email-exact candidate exists", async () => {
    h.parseResume.mockResolvedValue(clinicalData());
    h.candidateRepo.list.mockResolvedValue([{ id: "c1", name: "X", email: "jane@example.com" }]);

    const result = await resumeService.extract({ variant: "clinical", text: "x".repeat(60) });
    expect(result.match).toMatchObject({ status: "auto", candidateId: "c1" });
  });
});

describe("resumeService.save", () => {
  it("attaches to an email-exact (auto) candidate: fills empty fields + document + audit in one tx", async () => {
    h.candidateRepo.list.mockResolvedValue([
      { id: "c1", name: "Jane Doe", email: "jane@example.com" },
    ]);
    // Existing candidate with empty phone/city — OQ-2 fills only those.
    h.candidateRepo.findById.mockResolvedValue({
      id: "c1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
      city: null,
      licenseNumber: null,
    });
    h.candidateRepo.update.mockResolvedValue({ id: "c1", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({ id: "d1", candidateId: "c1", type: "resume" });

    await resumeService.save(saveInput(), h.user as AuthUser);

    // Attached to c1 via the shared tx; fills are empty-only (never overwrites name).
    const [uid, fills, utx] = h.candidateRepo.update.mock.calls[0]!;
    expect(uid).toBe("c1");
    expect(utx).toBe(h.fakeTx);
    expect(fills).toMatchObject({ phone: "(555) 555-0100", city: "Austin" });
    expect("name" in (fills as object)).toBe(false);
    expect(h.candidateRepo.create).not.toHaveBeenCalled();

    // Document created with the candidate id + full extractedData, same tx.
    const [docData, dtx] = h.documentRepo.create.mock.calls[0]!;
    expect(dtx).toBe(h.fakeTx);
    expect(docData).toMatchObject({ candidateId: "c1", type: "resume", uploadedById: "u1" });
    expect(docData.extractedData).toMatchObject({ name: "Jane Doe" });

    // Audit: attach, same tx.
    const [atx, params] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(params).toMatchObject({ entity: "document", action: "attach", actor: "u1" });
    assertNoPiiLogged();
  });

  it("attaches on an explicit confirmedCandidateId that the server re-matches (name-fuzzy)", async () => {
    h.candidateRepo.list.mockResolvedValue([{ id: "c2", name: "Jane Doe", email: "other@x.com" }]);
    h.candidateRepo.findById.mockResolvedValue({
      id: "c2",
      name: "Jane Doe",
      email: "other@x.com",
    });
    h.candidateRepo.update.mockResolvedValue({ id: "c2" });
    h.documentRepo.create.mockResolvedValue({ id: "d2", candidateId: "c2", type: "resume" });

    await resumeService.save(saveInput({ confirmedCandidateId: "c2" }), h.user as AuthUser);

    expect(h.candidateRepo.findById).toHaveBeenCalledWith("c2", undefined, h.fakeTx);
    expect(h.candidateRepo.create).not.toHaveBeenCalled();
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "attach" });
  });

  it("creates a NEW candidate when there is no match (none)", async () => {
    h.candidateRepo.list.mockResolvedValue([]);
    h.candidateRepo.create.mockResolvedValue({ id: "new1", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({ id: "d3", candidateId: "new1", type: "resume" });

    await resumeService.save(saveInput(), h.user as AuthUser);

    const [createData, ctx] = h.candidateRepo.create.mock.calls[0]!;
    expect(ctx).toBe(h.fakeTx);
    // create forces NEW_CANDIDATE (stage 0) — extraction never sets a stage.
    expect(createData).toMatchObject({ status: "NEW_CANDIDATE", stageOrder: 0, createdById: "u1" });
    expect(h.candidateRepo.findById).not.toHaveBeenCalled();
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "create" });
    assertNoPiiLogged();
  });

  it("REFUSES a confirmedCandidateId the server does not re-match → creates new instead", async () => {
    // Client echoes c9, but that candidate doesn't match the resume (wrong name, wrong email).
    h.candidateRepo.list.mockResolvedValue([
      { id: "c9", name: "Completely Unrelated", email: "nope@x.com" },
    ]);
    h.candidateRepo.create.mockResolvedValue({ id: "new2", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({ id: "d4", candidateId: "new2", type: "resume" });

    await resumeService.save(saveInput({ confirmedCandidateId: "c9" }), h.user as AuthUser);

    expect(h.candidateRepo.create).toHaveBeenCalledTimes(1); // no silent wrong-person attach
    expect(h.candidateRepo.findById).not.toHaveBeenCalled();
    expect(h.candidateRepo.update).not.toHaveBeenCalled();
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "create" });
  });

  it("threads storageKey through to the document when present (Wave 6)", async () => {
    h.candidateRepo.list.mockResolvedValue([]);
    h.candidateRepo.create.mockResolvedValue({ id: "new3", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({ id: "d5", candidateId: "new3", type: "resume" });

    await resumeService.save(saveInput({ storageKey: "abc-jane.pdf" }), h.user as AuthUser);

    const [docData] = h.documentRepo.create.mock.calls[0]!;
    expect(docData).toMatchObject({ storageKey: "abc-jane.pdf" });
  });

  it("stores storageKey as null when absent (storage not configured — unchanged behavior)", async () => {
    h.candidateRepo.list.mockResolvedValue([]);
    h.candidateRepo.create.mockResolvedValue({ id: "new4", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({ id: "d6", candidateId: "new4", type: "resume" });

    await resumeService.save(saveInput(), h.user as AuthUser);

    const [docData] = h.documentRepo.create.mock.calls[0]!;
    expect(docData).toMatchObject({ storageKey: null });
  });
});

describe("resumeService.requestUploadUrl", () => {
  it("builds a sanitized, unique storage key and returns the signed upload URL", async () => {
    h.createSignedUploadUrl.mockResolvedValue({ signedUrl: "https://x/upload", token: "tok" });

    const result = await resumeService.requestUploadUrl({
      filename: "Jane Doe's Resume (final)!!.pdf",
      mimeType: "application/pdf",
    });

    expect(result.signedUrl).toBe("https://x/upload");
    expect(result.storageKey).toMatch(/^[0-9a-f-]{36}-.+\.pdf$/);
    expect(result.storageKey).not.toMatch(/[()'!]/);
    const [bucket, , contentType] = h.createSignedUploadUrl.mock.calls[0]!;
    expect(bucket).toBe("resumes");
    expect(contentType).toBe("application/pdf");
  });
});

describe("resumeService.getDownloadUrl", () => {
  it("returns a fresh signed URL when the document has a storageKey", async () => {
    h.documentRepo.findById.mockResolvedValue({ id: "d1", storageKey: "abc-jane.pdf" });
    h.getSignedDownloadUrl.mockResolvedValue("https://x/download?sig=1");

    const result = await resumeService.getDownloadUrl("d1");

    expect(result).toEqual({ url: "https://x/download?sig=1" });
    expect(h.getSignedDownloadUrl).toHaveBeenCalledWith("resumes", "abc-jane.pdf", 300);
  });

  it("throws NOT_FOUND when the document has no storageKey", async () => {
    h.documentRepo.findById.mockResolvedValue({ id: "d1", storageKey: null });
    await expect(resumeService.getDownloadUrl("d1")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.getSignedDownloadUrl).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the document doesn't exist", async () => {
    h.documentRepo.findById.mockResolvedValue(null);
    await expect(resumeService.getDownloadUrl("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("resumeService.attachToCandidate", () => {
  it("creates a resume Document for the given candidate — no matching, no AI", async () => {
    h.candidateRepo.findById.mockResolvedValue({ id: "c1", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({
      id: "d1",
      candidateId: "c1",
      type: "resume",
      originalFilename: "jane.pdf",
      mimeType: "application/pdf",
      extractedText: "some text",
      storageKey: "k1-jane.pdf",
      createdAt: new Date("2026-08-11T00:00:00.000Z"),
    });

    const doc = await resumeService.attachToCandidate(
      "c1",
      {
        originalFilename: "jane.pdf",
        mimeType: "application/pdf",
        extractedText: "some text",
        storageKey: "k1-jane.pdf",
      },
      h.user as AuthUser,
    );

    expect(h.documentRepo.create).toHaveBeenCalledWith(
      {
        candidateId: "c1",
        type: "resume",
        originalFilename: "jane.pdf",
        mimeType: "application/pdf",
        extractedText: "some text",
        storageKey: "k1-jane.pdf",
        uploadedById: "u1",
      },
      h.fakeTx,
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "document", entityId: "d1", action: "upload" }),
    );
    expect(doc.id).toBe("d1");
  });

  it("defaults extractedText/storageKey to null when omitted (best-effort extraction)", async () => {
    h.candidateRepo.findById.mockResolvedValue({ id: "c1", name: "Jane Doe" });
    h.documentRepo.create.mockResolvedValue({ id: "d2" });

    await resumeService.attachToCandidate(
      "c1",
      { originalFilename: "scan.pdf", mimeType: "application/pdf" },
      h.user as AuthUser,
    );

    expect(h.documentRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ extractedText: null, storageKey: null }),
      h.fakeTx,
    );
  });

  it("throws NOT_FOUND and never creates a document when the candidate doesn't exist", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);

    await expect(
      resumeService.attachToCandidate(
        "missing",
        { originalFilename: "jane.pdf", mimeType: "application/pdf" },
        h.user as AuthUser,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.documentRepo.create).not.toHaveBeenCalled();
  });
});
