import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the note service WITHOUT a DB: bodies are stored RAW (no HTML stripping — the XSS defense
 * is at render), `authorId`/`authorName` come from the session (never the client body), an add
 * writes note + mention rows + an `add_note` audit inside ONE txn, a missing candidate →
 * NOT_FOUND, mentions are re-derived server-side from the body (self-mentions dropped), and
 * `visibleNotes` gates non-`internal` types behind `viewAllNoteTypes` (server-side — the legacy
 * shipped hidden notes to the browser). Repos + audit + txn are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  owner: { id: "o1", email: "o@desta.works", name: "Owner", role: "Owner" as const },
  candidateRepo: { findById: vi.fn() },
  noteRepo: { create: vi.fn(), listByCandidate: vi.fn() },
  mentionRepo: { createMany: vi.fn() },
  userRepo: { list: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
}));
vi.mock("@/server/repositories/note.repository", () => ({ noteRepository: h.noteRepo }));
vi.mock("@/server/repositories/mention.repository", () => ({ mentionRepository: h.mentionRepo }));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
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
  h.mentionRepo.createMany.mockReset();
  h.mentionRepo.createMany.mockResolvedValue(0);
  h.userRepo.list.mockReset();
  h.userRepo.list.mockResolvedValue([]);
  h.writeAudit.mockReset();
});

describe("noteService.add", () => {
  it("stores the body RAW (no HTML stripping) and takes author from the session, not the client", async () => {
    const xss = "<img src=x onerror=alert(1)>";
    h.candidateRepo.findById.mockResolvedValue({ id: "c1" });
    h.noteRepo.create.mockResolvedValue(noteRow({ body: xss, noteType: "client" }));

    const dto = await noteService.add("c1", { body: xss, noteType: "client" }, h.user as AuthUser);

    // Body passed to the repo is BYTE-FOR-BYTE what was submitted — no sanitization at rest.
    expect(h.noteRepo.create).toHaveBeenCalledTimes(1);
    const [data, tx] = h.noteRepo.create.mock.calls[0]!;
    expect(data.body).toBe(xss);
    expect(tx).toBe(h.fakeTx);
    // author comes from the session, NOT the client body.
    expect(data.authorId).toBe("u1");
    expect(data.authorName).toBe("Test User");
    expect(data.candidateId).toBe("c1");
    expect(data.noteType).toBe("client");
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

  it("re-derives mentions from the body server-side and writes rows in the same tx (self dropped)", async () => {
    h.candidateRepo.findById.mockResolvedValue({ id: "c1" });
    h.noteRepo.create.mockResolvedValue(noteRow({ body: "@Biruh @Test see this" }));
    // Author (Test User) mentions himself + Biruh — only Biruh gets a mention row.
    h.userRepo.list.mockResolvedValue([
      { id: "u1", name: "Test User" },
      { id: "u2", name: "Biruh Desta" },
    ]);

    await noteService.add(
      "c1",
      { body: "@Biruh @Test see this", noteType: "internal" },
      h.user as AuthUser,
    );

    expect(h.mentionRepo.createMany).toHaveBeenCalledWith(
      { noteId: "n1", candidateId: "c1", recipientIds: ["u2"] },
      h.fakeTx,
    );
    // The audit records who was mentioned.
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({
      after: { noteId: "n1", noteType: "internal", mentioned: ["u2"] },
    });
  });

  it("throws NOT_FOUND when the candidate is missing/soft-deleted and writes nothing", async () => {
    h.candidateRepo.findById.mockResolvedValue(null);
    await expect(
      noteService.add("missing", { body: "hi", noteType: "internal" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.noteRepo.create).not.toHaveBeenCalled();
    expect(h.mentionRepo.createMany).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("noteService.listByCandidate", () => {
  it("returns server-scoped notes mapped to DTOs (newest-first from the repo)", async () => {
    h.noteRepo.listByCandidate.mockResolvedValue([
      noteRow({ id: "n2", noteType: "call" }),
      noteRow({ id: "n1", noteType: "internal" }),
    ]);
    const dtos = await noteService.listByCandidate("c1", h.owner);
    expect(dtos.map((n) => n.id)).toEqual(["n2", "n1"]);
    expect(dtos[0]).toMatchObject({ id: "n2", noteType: "call" });
    // ISO string dates on the wire.
    expect(dtos[0]!.createdAt).toBe("2026-07-04T00:00:00.000Z");
  });

  it("scopes an Associate viewer to internal notes only (server-side)", async () => {
    h.noteRepo.listByCandidate.mockResolvedValue([
      noteRow({ id: "n2", noteType: "call" }),
      noteRow({ id: "n1", noteType: "internal" }),
    ]);
    const dtos = await noteService.listByCandidate("c1", h.user);
    expect(dtos.map((n) => n.id)).toEqual(["n1"]);
  });
});

describe("visibleNotes (server-authoritative)", () => {
  const notes = [
    noteRow({ id: "n1", noteType: "internal" }),
    noteRow({ id: "n2", noteType: "client" }),
    noteRow({ id: "n3", noteType: "call" }),
    noteRow({ id: "n4", noteType: "email" }),
    noteRow({ id: "n5", noteType: "text" }),
  ];

  it("a viewAllNoteTypes holder (Owner/Admin tier) sees all 5 types", () => {
    expect(visibleNotes(notes, h.owner).map((n) => n.id)).toEqual(["n1", "n2", "n3", "n4", "n5"]);
    expect(
      visibleNotes(notes, { id: "a1", name: "Admin", role: "Admin" }).map((n) => n.id),
    ).toEqual(["n1", "n2", "n3", "n4", "n5"]);
  });

  it("non-holders (incl. Director/Manager — legacy parity) see ONLY internal", () => {
    expect(visibleNotes(notes, h.user).map((n) => n.id)).toEqual(["n1"]);
    expect(
      visibleNotes(notes, { id: "d1", name: "Dir", role: "Director" }).map((n) => n.id),
    ).toEqual(["n1"]);
    expect(
      visibleNotes(notes, { id: "m1", name: "Mgr", role: "Manager" }).map((n) => n.id),
    ).toEqual(["n1"]);
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
