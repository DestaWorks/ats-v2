import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TenantContext } from "@destaworks/domain/tenant";

/**
 * Proves the mention read-side WITHOUT a DB: `listMine` returns the viewer's rows (serialized,
 * excerpt-truncated) + the true unread count; `markRead` is recipient-scoped (someone else's id →
 * NOT_FOUND, already-read → idempotent success) and returns the fresh unread count.
 */

const h = vi.hoisted(() => ({
  user: {
    tenantId: "t1",
    membershipId: "u1-m",
    user: { id: "u1", email: "u@desta.works", name: "Test User" },
    role: "Associate" as const,
  },
  repo: {
    listForRecipient: vi.fn(),
    countUnread: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    existsForRecipient: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/mention.repository", () => ({ mentionRepository: h.repo }));

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
  h.repo.existsForRecipient.mockReset();
  h.repo.listForRecipient.mockResolvedValue([]);
  h.repo.countUnread.mockResolvedValue(0);
});

describe("mentionService.listMine", () => {
  it("returns the viewer's mentions serialized + the true unread count", async () => {
    h.repo.listForRecipient.mockResolvedValue([mentionRow()]);
    h.repo.countUnread.mockResolvedValue(3);

    const out = await mentionService.listMine(h.user as TenantContext);

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
    const out = await mentionService.listMine(h.user as TenantContext);
    expect(out.mentions[0]!.excerpt.length).toBeLessThanOrEqual(140);
    expect(out.mentions[0]!.excerpt.endsWith("…")).toBe(true);
  });
});

describe("mentionService.markRead", () => {
  it("marks one mention read (recipient-scoped) and returns the fresh unread count", async () => {
    h.repo.markRead.mockResolvedValue(1);
    h.repo.countUnread.mockResolvedValue(0);

    const out = await mentionService.markRead(
      { mentionId: "m1", all: false },
      h.user as TenantContext,
    );

    expect(h.repo.markRead).toHaveBeenCalledWith("m1", "u1");
    expect(out).toEqual({ unread: 0 });
  });

  it("marking an ALREADY-READ mention of mine is an idempotent success", async () => {
    h.repo.markRead.mockResolvedValue(0);
    h.repo.existsForRecipient.mockResolvedValue(true);

    await expect(
      mentionService.markRead({ mentionId: "m1", all: false }, h.user as TenantContext),
    ).resolves.toEqual({ unread: 0 });
  });

  it("F7: an already-read mention OLDER than the 20-most-recent page is still an idempotent success (existsForRecipient is unbounded)", async () => {
    h.repo.markRead.mockResolvedValue(0);
    h.repo.existsForRecipient.mockResolvedValue(true);

    await expect(
      mentionService.markRead({ mentionId: "old-m1", all: false }, h.user as TenantContext),
    ).resolves.toEqual({ unread: 0 });
    expect(h.repo.existsForRecipient).toHaveBeenCalledWith("old-m1", "u1");
    expect(h.repo.listForRecipient).not.toHaveBeenCalled();
  });

  it("someone else's / missing mention id → NOT_FOUND", async () => {
    h.repo.markRead.mockResolvedValue(0);
    h.repo.existsForRecipient.mockResolvedValue(false);

    await expect(
      mentionService.markRead({ mentionId: "not-mine", all: false }, h.user as TenantContext),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("all: true marks everything read for the session user only", async () => {
    h.repo.markAllRead.mockResolvedValue(4);
    h.repo.countUnread.mockResolvedValue(0);

    const out = await mentionService.markRead(
      { mentionId: null, all: true },
      h.user as TenantContext,
    );

    expect(h.repo.markAllRead).toHaveBeenCalledWith("u1");
    expect(h.repo.markRead).not.toHaveBeenCalled();
    expect(out).toEqual({ unread: 0 });
  });
});
