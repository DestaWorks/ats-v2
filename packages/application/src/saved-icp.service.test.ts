import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthUser } from "@destaworks/auth/guards";

/**
 * Proves saved-ICP ownership isolation (only the caller's private ICPs are ever excluded from
 * `list`; delete is always scoped to the caller's id) and the create/duplicate-name round-trip —
 * all WITHOUT a DB. Mirrors `saved-view.service.test.ts` exactly. `savedIcpRepository`,
 * `userRepository`, `writeAudit`, and `withTransaction` are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  associate: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  other: { id: "u2", email: "other@desta.works", name: "Other User", role: "Associate" as const },
  repo: {
    listByUser: vi.fn(),
    listAll: vi.fn(),
    findByUserAndName: vi.fn(),
    create: vi.fn(),
    deleteOwned: vi.fn(),
  },
  userRepo: { namesByIds: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/db/repositories/saved-icp.repository", () => ({ savedIcpRepository: h.repo }));
vi.mock("@destaworks/db/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@destaworks/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@destaworks/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { savedIcpService } from "./saved-icp.service";

const associate = h.associate as AuthUser;
const other = h.other as AuthUser;

beforeEach(() => {
  vi.clearAllMocks();
  h.userRepo.namesByIds.mockResolvedValue(new Map());
});

function icp(overrides: Record<string, unknown> = {}) {
  return {
    id: "icp1",
    userId: "u1",
    name: "CT Behavioral Health",
    taxonomy: "Behavioral Health",
    state: "CT",
    city: null,
    zip: null,
    isPrivate: false,
    createdAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  };
}

describe("savedIcpService.list — visibility", () => {
  it("includes every shared (non-private) ICP regardless of owner", async () => {
    h.repo.listAll.mockResolvedValue([icp({ id: "icp1", userId: "u2", isPrivate: false })]);
    const dtos = await savedIcpService.list(associate);
    expect(dtos.map((d) => d.id)).toEqual(["icp1"]);
  });

  it("excludes another user's PRIVATE ICP, but includes the caller's own private ICP", async () => {
    h.repo.listAll.mockResolvedValue([
      icp({ id: "mine", userId: "u1", isPrivate: true }),
      icp({ id: "theirs", userId: "u2", isPrivate: true }),
    ]);
    const dtos = await savedIcpService.list(associate);
    expect(dtos.map((d) => d.id)).toEqual(["mine"]);
  });
});

describe("savedIcpService.remove — ownership isolation", () => {
  it("throws NOT_FOUND (not FORBIDDEN) when the row isn't found or isn't the caller's, and never audits", async () => {
    h.repo.deleteOwned.mockResolvedValue({ count: 0 });
    await expect(savedIcpService.remove("icp1", other)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.repo.deleteOwned).toHaveBeenCalledWith("icp1", "u2", h.fakeTx);
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("deletes + audits when the row exists and belongs to the caller", async () => {
    h.repo.deleteOwned.mockResolvedValue({ count: 1 });
    const result = await savedIcpService.remove("icp1", associate);
    expect(result).toEqual({ id: "icp1" });
    expect(h.repo.deleteOwned).toHaveBeenCalledWith("icp1", "u1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "saved_icp", entityId: "icp1", action: "delete" }),
    );
  });
});

describe("savedIcpService.create", () => {
  it("creates + audits, defaulting isPrivate to false", async () => {
    h.repo.findByUserAndName.mockResolvedValue(null);
    h.repo.create.mockResolvedValue(icp());
    const dto = await savedIcpService.create(
      { name: "CT Behavioral Health", state: "CT" },
      associate,
    );
    expect(h.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", name: "CT Behavioral Health", isPrivate: false }),
      h.fakeTx,
    );
    expect(h.writeAudit).toHaveBeenCalledWith(
      h.fakeTx,
      expect.objectContaining({ entity: "saved_icp", action: "create" }),
    );
    expect(dto).toMatchObject({ id: "icp1", name: "CT Behavioral Health" });
  });

  it("rejects a duplicate name for the same user with CONFLICT, never calling create", async () => {
    h.repo.findByUserAndName.mockResolvedValue(icp());
    await expect(
      savedIcpService.create({ name: "CT Behavioral Health" }, associate),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.repo.create).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});
