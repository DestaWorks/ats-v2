import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves saved-view ownership isolation (a user can only ever list/delete their own rows — the
 * repository is always called with `user.id`, never a client-suppliable value) and the
 * create/duplicate-name round-trip — all WITHOUT a DB. `savedViewRepository`, `writeAudit`, and
 * `withTransaction` are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  associate: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  other: { id: "u2", email: "other@desta.works", name: "Other User", role: "Associate" as const },
  repo: {
    listByUser: vi.fn(),
    findByUserScopeName: vi.fn(),
    create: vi.fn(),
    deleteOwned: vi.fn(),
  },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/saved-view.repository", () => ({ savedViewRepository: h.repo }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { savedViewService } from "./saved-view.service";

const associate = h.associate as AuthUser;
const other = h.other as AuthUser;

beforeEach(() => {
  vi.clearAllMocks();
});

function view(overrides: Record<string, unknown> = {}) {
  return {
    id: "v1",
    userId: "u1",
    scope: "pipeline",
    name: "My hot leads",
    query: "mine=1&hot=1",
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("savedViewService.list — ownership isolation", () => {
  it("always queries by the CALLER's id, never a client-suppliable value", async () => {
    h.repo.listByUser.mockResolvedValue([view()]);
    await savedViewService.list("pipeline", associate);
    expect(h.repo.listByUser).toHaveBeenCalledWith("u1", "pipeline");

    h.repo.listByUser.mockClear();
    await savedViewService.list("pipeline", other);
    expect(h.repo.listByUser).toHaveBeenCalledWith("u2", "pipeline");
  });
});

describe("savedViewService.remove — ownership isolation", () => {
  it("throws NOT_FOUND (not FORBIDDEN) when the row isn't found or isn't the caller's, and never audits", async () => {
    h.repo.deleteOwned.mockResolvedValue({ count: 0 });
    await expect(savedViewService.remove("v1", other)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.repo.deleteOwned).toHaveBeenCalledWith("v1", "u2", h.fakeTx);
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("deletes + audits when the row exists and belongs to the caller", async () => {
    h.repo.deleteOwned.mockResolvedValue({ count: 1 });
    const result = await savedViewService.remove("v1", associate);
    expect(result).toEqual({ id: "v1" });
    expect(h.repo.deleteOwned).toHaveBeenCalledWith("v1", "u1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "saved_view", entityId: "v1", action: "delete" }),
    );
  });
});

describe("savedViewService.create", () => {
  it("creates + audits, stripping a leading '?' from the query", async () => {
    h.repo.findByUserScopeName.mockResolvedValue(null);
    h.repo.create.mockResolvedValue(view({ query: "mine=1" }));
    const dto = await savedViewService.create(
      { scope: "pipeline", name: "My hot leads", query: "?mine=1" },
      associate,
    );
    expect(h.repo.create).toHaveBeenCalledWith(
      { userId: "u1", scope: "pipeline", name: "My hot leads", query: "mine=1" },
      h.fakeTx,
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "saved_view", action: "create" }),
    );
    expect(dto).toMatchObject({ id: "v1", scope: "pipeline", name: "My hot leads" });
  });

  it("rejects a duplicate name for the same user+scope with CONFLICT, never calling create", async () => {
    h.repo.findByUserScopeName.mockResolvedValue(view());
    await expect(
      savedViewService.create(
        { scope: "pipeline", name: "My hot leads", query: "mine=1" },
        associate,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.repo.create).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});
