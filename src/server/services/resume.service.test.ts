import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";
import type { ClinicalResume } from "@/lib/validation/resume";

/**
 * Résumé service tests (§8) WITHOUT a DB or real Claude: `extract` returns data + the server match;
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
  documentRepo: { create: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/ai/parse-resume", () => ({ parseResume: h.parseResume }));
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

import { resumeService } from "./resume.service";

/** A complete, schema-valid clinical résumé (save re-validates `data`). */
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
    extractedText: "raw résumé text with LPC-SECRET-99",
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
  h.writeAudit.mockReset();
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
    // Client echoes c9, but that candidate doesn't match the résumé (wrong name, wrong email).
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
});
