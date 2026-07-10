import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the mention read-side WITHOUT a DB: `listMine` returns the viewer's rows (serialized,
 * excerpt-truncated) + the true unread count; `markRead` is recipient-scoped (someone else's id →
 * NOT_FOUND, already-read → idempotent success) and returns the fresh unread count.
 */

const h = vi.hoisted(() => ({
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  repo: {
    listForRecipient: vi.fn(),
    countUnread: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/mention.repository", () => ({ mentionRepository: h.repo }));

import { mentionService } from "./mention.service";

function mentionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    noteId: "n1",
    candidateId: "c1",
    recipientId: "u1",
    createdAt: new Date("2026-07-09T10:00:00.000Z"),
    readAt: null,
    note: {
      authorId: "u2",
      authorName: "Biruh Desta",
      noteType: "internal",
      body: "ping @Test re this candidate",
      candidate: { name: "Jane Doe" },
    },
    ...overrides,
  };
}

beforeEach(() => {
  h.repo.listForRecipient.mockReset();
  h.repo.countUnread.mockReset();
  h.repo.markRead.mockReset();
  h.repo.markAllRead.mockReset();
  h.repo.listForRecipient.mockResolvedValue([]);
  h.repo.countUnread.mockResolvedValue(0);
});

describe("mentionService.listMine", () => {
  it("returns the viewer's mentions serialized + the true unread count", async () => {
    h.repo.listForRecipient.mockResolvedValue([mentionRow()]);
    h.repo.countUnread.mockResolvedValue(3);

    const out = await mentionService.listMine(h.user as AuthUser);

    expect(h.repo.listForRecipient).toHaveBeenCalledWith("u1", expect.any(Number));
    expect(out.unread).toBe(3);
    expect(out.mentions).toEqual([
      {
        id: "m1",
        candidateId: "c1",
        candidateName: "Jane Doe",
        authorName: "Biruh Desta",
        noteType: "internal",
        excerpt: "ping @Test re this candidate",
        createdAt: "2026-07-09T10:00:00.000Z",
        readAt: null,
      },
    ]);
  });

  it("truncates long bodies to an excerpt with an ellipsis", async () => {
    h.repo.listForRecipient.mockResolvedValue([
      mentionRow({
        note: {
          authorId: "u2",
          authorName: "Biruh Desta",
          noteType: "internal",
          body: "x".repeat(300),
          candidate: { name: "Jane Doe" },
        },
      }),
    ]);
    const out = await mentionService.listMine(h.user as AuthUser);
    expect(out.mentions[0]!.excerpt.length).toBeLessThanOrEqual(140);
    expect(out.mentions[0]!.excerpt.endsWith("…")).toBe(true);
  });
});

describe("mentionService.markRead", () => {
  it("marks one mention read (recipient-scoped) and returns the fresh unread count", async () => {
    h.repo.markRead.mockResolvedValue(1);
    h.repo.countUnread.mockResolvedValue(0);

    const out = await mentionService.markRead({ mentionId: "m1", all: false }, h.user as AuthUser);

    expect(h.repo.markRead).toHaveBeenCalledWith("m1", "u1");
    expect(out).toEqual({ unread: 0 });
  });

  it("marking an ALREADY-READ mention of mine is an idempotent success", async () => {
    h.repo.markRead.mockResolvedValue(0); // no unread row updated
    h.repo.listForRecipient.mockResolvedValue([
      mentionRow({ readAt: new Date("2026-07-09T11:00:00.000Z") }),
    ]);

    await expect(
      mentionService.markRead({ mentionId: "m1", all: false }, h.user as AuthUser),
    ).resolves.toEqual({ unread: 0 });
  });

  it("someone else's / missing mention id → NOT_FOUND", async () => {
    h.repo.markRead.mockResolvedValue(0);
    h.repo.listForRecipient.mockResolvedValue([]); // not among the viewer's mentions

    await expect(
      mentionService.markRead({ mentionId: "not-mine", all: false }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("all: true marks everything read for the session user only", async () => {
    h.repo.markAllRead.mockResolvedValue(4);
    h.repo.countUnread.mockResolvedValue(0);

    const out = await mentionService.markRead({ mentionId: null, all: true }, h.user as AuthUser);

    expect(h.repo.markAllRead).toHaveBeenCalledWith("u1");
    expect(h.repo.markRead).not.toHaveBeenCalled();
    expect(out).toEqual({ unread: 0 });
  });
});
