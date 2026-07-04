import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the note service WITHOUT a DB: bodies are stored RAW (no HTML stripping — the XSS defense
 * is at render), `authorId`/`authorName` come from the session (never the client body), an add
 * writes an `add_note` audit inside the txn, a missing candidate → NOT_FOUND, and `visibleNotes`
 * is server-side (v1: internal + external for any operator). Repos + audit + txn are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  candidateRepo: { findById: vi.fn() },
  noteRepo: { create: vi.fn(), listByCandidate: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/note.repository", () => ({ noteRepository: h.noteRepo }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { noteService, visibleNotes, toNoteDTO } from "./note.service";

function noteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    legacyId: null,
    candidateId: "c1",
    authorId: "u1",
    authorName: "Test User",
    body: "hello",
    noteType: "internal",
    createdAt: new Date("2026-07-04T00:00:00.000Z"),
    updatedAt: new Date("2026-07-04T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

beforeEach(() => {
  h.candidateRepo.findById.mockReset();
  h.noteRepo.create.mockReset();
  h.noteRepo.listByCandidate.mockReset();
  h.writeAudit.mockReset();
});

describe("noteService.add", () => {
  it("stores the body RAW (no HTML stripping) and takes author from the session, not the client", async () => {
    const xss = "<img src=x onerror=alert(1)>";
    h.candidateRepo.findById.mockResolvedValue({ id: "c1" });
    h.noteRepo.create.mockResolvedValue(noteRow({ body: xss, noteType: "external" }));

    const dto = await noteService.add(
      "c1",
      { body: xss, noteType: "external" },
      h.user as AuthUser,
    );

    // Body passed to the repo is BYTE-FOR-BYTE what was submitted — no sanitization at rest.
    expect(h.noteRepo.create).toHaveBeenCalledTimes(1);
    const [data, tx] = h.noteRepo.create.mock.calls[0]!;
    expect(data.body).toBe(xss);
    expect(tx).toBe(h.fakeTx);
    // author comes from the session, NOT the client body.
    expect(data.authorId).toBe("u1");
    expect(data.authorName).toBe("Test User");
    expect(data.candidateId).toBe("c1");
    expect(data.noteType).toBe("external");
    // returned DTO carries the raw body verbatim.
    expect(dto.body).toBe(xss);
  });

  it("writes an add_note audit row inside the same transaction", async () => {
    h.candidateRepo.findById.mockResolvedValue({ id: "c1" });
    h.noteRepo.create.mockResolvedValue(noteRow());

    await noteService.add("c1", { body: "hi", noteType: "internal" }, h.user as AuthUser);

    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    const [atx, params] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(params).toMatchObject({
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "add_note",
    });
  });

  it("throws NOT_FOUND when the candidate is missing/soft-deleted and writes nothing", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      noteService.add("missing", { body: "hi", noteType: "internal" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.noteRepo.create).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("noteService.listByCandidate", () => {
  it("returns server-scoped notes mapped to DTOs (newest-first from the repo)", async () => {
    h.noteRepo.listByCandidate.mockResolvedValue([
      noteRow({ id: "n2", noteType: "external" }),
      noteRow({ id: "n1", noteType: "internal" }),
    ]);
    const dtos = await noteService.listByCandidate("c1", h.user);
    expect(dtos.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(dtos[0]).toMatchObject({ id: "n2", noteType: "external" });
    // ISO string dates on the wire.
    expect(dtos[0]!.createdAt).toBe("2026-07-04T00:00:00.000Z");
  });
});

describe("visibleNotes (server-authoritative)", () => {
  it("v1: an operator sees BOTH internal and external notes", () => {
    const notes = [
      noteRow({ id: "n1", noteType: "internal" }),
      noteRow({ id: "n2", noteType: "external" }),
    ];
    const seen = visibleNotes(notes, h.user);
    expect(seen.map((n) => n.id)).toEqual(["n1", "n2"]);
  });
});

describe("toNoteDTO", () => {
  it("projects the row and serializes the date to ISO", () => {
    const dto = toNoteDTO(noteRow());
    expect(dto).toEqual({
      id: "n1",
      body: "hello",
      noteType: "internal",
      authorId: "u1",
      authorName: "Test User",
      createdAt: "2026-07-04T00:00:00.000Z",
    });
  });
});
