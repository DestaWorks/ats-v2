import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves the capability gate on audit reads: `activity_log` rows can hold PII/PHI, so only
 * holders of `viewAudit` (admin-only: Owner/Admin) may read the trail. We exercise the REAL guard
 * (`requireCapability`) by mocking the Better Auth session + `next/headers` (same pattern as
 * `guards.test.ts`) and stub the repositories so no DB is touched — the role always comes from the
 * (mocked) session.
 *
 * The Wave 2.5 Activity Log suite additionally proves: the filter/date-range `where` the service
 * hands the repo (UTC day-bounds), keyset pagination off `pageSize + 1`, actor-name + candidate-
 * label resolution (incl. soft-deleted → no link), and — load-bearing for PII — that the list DTO
 * NEVER carries the raw `before`/`after` snapshots (only `hasChanges`), while the detail read does.
 */

let mockSession: { user: { id: string; email: string; name: string; role?: string } } | null = null;

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/server/auth/auth", () => ({
  auth: { api: { getSession: async () => mockSession } },
}));

const listForEntity = vi.fn();
const list = vi.fn();
const findById = vi.fn();
const distinctActors = vi.fn();
vi.mock("@/server/repositories/audit.repository", () => ({
  auditRepository: {
    listForEntity: (...args: unknown[]) => listForEntity(...args),
    list: (...args: unknown[]) => list(...args),
    findById: (...args: unknown[]) => findById(...args),
    distinctActors: (...args: unknown[]) => distinctActors(...args),
  },
}));

const userNamesByIds = vi.fn();
vi.mock("@/server/repositories/user.repository", () => ({
  userRepository: { namesByIds: (...args: unknown[]) => userNamesByIds(...args) },
}));

const candidateNamesByIds = vi.fn();
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: { namesByIds: (...args: unknown[]) => candidateNamesByIds(...args) },
}));

import { auditService } from "./audit.service";
import { decodeCursor } from "@/lib/validation/cursor";

function signInAs(role?: string) {
  mockSession = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

/** A raw audit row as the repo's `list` returns it (before/after selected to derive `hasChanges`). */
function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    at: new Date("2026-06-01T12:00:00.000Z"),
    actor: "u1",
    action: "update",
    entity: "candidate",
    entityId: "c1",
    before: { name: "Old" },
    after: { name: "New" },
    ...overrides,
  };
}

beforeEach(() => {
  mockSession = null;
  listForEntity.mockReset();
  list.mockReset().mockResolvedValue([]);
  findById.mockReset();
  distinctActors.mockReset().mockResolvedValue([]);
  userNamesByIds.mockReset().mockResolvedValue(new Map());
  candidateNamesByIds.mockReset().mockResolvedValue(new Map());
});

describe("auditService.listAuditForEntity — capability gate", () => {
  it("blocks an Associate with FORBIDDEN (and never reads the repository)", async () => {
    signInAs("Associate");
    await expect(auditService.listAuditForEntity("candidate", "c1")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(listForEntity).not.toHaveBeenCalled();
  });

  it("admits an admin/superuser and returns the rows", async () => {
    signInAs("Owner");
    const rows = [{ id: "a1", entity: "candidate", entityId: "c1" }];
    listForEntity.mockResolvedValue(rows);

    await expect(auditService.listAuditForEntity("candidate", "c1")).resolves.toBe(rows);
    expect(listForEntity).toHaveBeenCalledWith("candidate", "c1");
  });
});

describe("auditService.listActivity — capability gate", () => {
  for (const role of ["Director", "Manager", "Screener", "Associate"]) {
    it(`blocks a ${role} (no viewAudit) with FORBIDDEN and reads nothing`, async () => {
      signInAs(role);
      await expect(auditService.listActivity({}, null)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(list).not.toHaveBeenCalled();
    });
  }

  for (const role of ["Owner", "Admin"]) {
    it(`admits a ${role} (viewAudit holder)`, async () => {
      signInAs(role);
      await expect(auditService.listActivity({}, null)).resolves.toMatchObject({
        items: [],
        hasMore: false,
        nextCursor: null,
      });
    });
  }
});

describe("auditService.listActivity — filters → repo where (UTC day-bounds)", () => {
  beforeEach(() => signInAs("Owner"));

  it("forwards action/entity/actor equality filters unchanged", async () => {
    await auditService.listActivity({ action: "purge", entity: "candidate", actor: "u9" }, null);
    const [filters] = list.mock.calls[0]!;
    expect(filters).toMatchObject({ action: "purge", entity: "candidate", actor: "u9" });
  });

  it("widens from → UTC start-of-day and to → UTC end-of-day", async () => {
    await auditService.listActivity(
      { from: new Date("2026-06-01T09:30:00.000Z"), to: new Date("2026-06-30T09:30:00.000Z") },
      null,
    );
    const [filters] = list.mock.calls[0]!;
    expect((filters.from as Date).toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect((filters.to as Date).toISOString()).toBe("2026-06-30T23:59:59.999Z");
  });

  it("passes take = pageSize + 1 (51) and the decoded cursor to the repo", async () => {
    const cursor = decodeCursor(
      Buffer.from(JSON.stringify(["2026-06-01T12:00:00.000Z", "a1"])).toString("base64url"),
      "at_desc",
    );
    await auditService.listActivity({}, cursor);
    const [, passedCursor, take] = list.mock.calls[0]!;
    expect(take).toBe(51);
    expect(passedCursor).toBe(cursor);
  });
});

describe("auditService.listActivity — pagination + resolution + no PII leak", () => {
  beforeEach(() => signInAs("Owner"));

  it("trims to pageSize and sets hasMore + nextCursor when the repo returns pageSize + 1", async () => {
    const rows = Array.from({ length: 51 }, (_, i) =>
      row({ id: `a${i}`, at: new Date(2026, 0, 1, 0, 0, i) }),
    );
    list.mockResolvedValue(rows);
    const res = await auditService.listActivity({}, null);
    expect(res.items).toHaveLength(50);
    expect(res.hasMore).toBe(true);
    // Cursor encodes (at, id) of the LAST returned (50th) row.
    const decoded = decodeCursor(res.nextCursor!, "at_desc");
    expect(decoded).toMatchObject({ id: "a49", value: rows[49]!.at.toISOString() });
  });

  it("no nextCursor + hasMore false when the page is not full", async () => {
    list.mockResolvedValue([row({ id: "a1" })]);
    const res = await auditService.listActivity({}, null);
    expect(res.hasMore).toBe(false);
    expect(res.nextCursor).toBeNull();
  });

  it("resolves actor names (missing → 'Unknown')", async () => {
    list.mockResolvedValue([row({ actor: "known" }), row({ id: "a2", actor: "ghost" })]);
    userNamesByIds.mockResolvedValue(new Map([["known", "Ada Lovelace"]]));
    const res = await auditService.listActivity({}, null);
    expect(userNamesByIds).toHaveBeenCalledWith(["known", "ghost"]);
    expect(res.items[0]!.actorName).toBe("Ada Lovelace");
    expect(res.items[1]!.actorName).toBe("Unknown");
  });

  it("labels + links a LIVE candidate, labels-only a soft-deleted one, and neither for purged", async () => {
    list.mockResolvedValue([
      row({ id: "a1", entity: "candidate", entityId: "live" }),
      row({ id: "a2", entity: "candidate", entityId: "trashed" }),
      row({ id: "a3", entity: "candidate", entityId: "purged" }),
    ]);
    candidateNamesByIds.mockResolvedValue(
      new Map([
        ["live", { id: "live", name: "Live Cand", deletedAt: null }],
        ["trashed", { id: "trashed", name: "Gone Cand", deletedAt: new Date() }],
        // "purged" absent from the map entirely.
      ]),
    );
    const res = await auditService.listActivity({}, null);
    // Resolved with includeDeleted so a since-deleted candidate still labels.
    expect(candidateNamesByIds).toHaveBeenCalledWith(["live", "trashed", "purged"], {
      includeDeleted: true,
    });
    expect(res.items[0]).toMatchObject({
      entityLabel: "Live Cand",
      entityLink: "/candidates/live",
    });
    expect(res.items[1]).toMatchObject({ entityLabel: "Gone Cand", entityLink: null });
    expect(res.items[2]).toMatchObject({ entityLabel: null, entityLink: null });
  });

  it("does NOT resolve labels for non-candidate entities", async () => {
    list.mockResolvedValue([row({ id: "a1", entity: "document", entityId: "d1" })]);
    const res = await auditService.listActivity({}, null);
    expect(candidateNamesByIds).toHaveBeenCalledWith([], { includeDeleted: true });
    expect(res.items[0]).toMatchObject({ entityLabel: null, entityLink: null });
  });

  it("derives hasChanges and DROPS the raw before/after from the list DTO", async () => {
    list.mockResolvedValue([
      row({ id: "withChanges", before: { a: 1 }, after: { a: 2 } }),
      row({ id: "noChanges", before: null, after: null }),
    ]);
    const res = await auditService.listActivity({}, null);
    expect(res.items[0]!.hasChanges).toBe(true);
    expect(res.items[1]!.hasChanges).toBe(false);
    for (const item of res.items) {
      expect(item).not.toHaveProperty("before");
      expect(item).not.toHaveProperty("after");
    }
  });
});

describe("auditService.getActivityDetail", () => {
  // The detail endpoint is the ONLY path that returns raw before/after PII — sweep every
  // non-admin role, not just one, to prove none can read a snapshot.
  it.each(["Associate", "Screener", "Manager", "Director"] as const)(
    "blocks a non-holder (%s) with FORBIDDEN and reads nothing",
    async (role) => {
      signInAs(role);
      await expect(auditService.getActivityDetail("a1")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(findById).not.toHaveBeenCalled();
    },
  );

  it("returns before/after for a holder", async () => {
    signInAs("Owner");
    findById.mockResolvedValue({ id: "a1", before: { name: "Old" }, after: { name: "New" } });
    await expect(auditService.getActivityDetail("a1")).resolves.toEqual({
      id: "a1",
      before: { name: "Old" },
      after: { name: "New" },
    });
  });

  it("throws NOT_FOUND for an unknown id", async () => {
    signInAs("Owner");
    findById.mockResolvedValue(null);
    await expect(auditService.getActivityDetail("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("auditService.listActorOptions", () => {
  it("blocks a non-holder with FORBIDDEN", async () => {
    signInAs("Associate");
    await expect(auditService.listActorOptions()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(distinctActors).not.toHaveBeenCalled();
  });

  it("resolves distinct actor ids → sorted named options ('Unknown' for unresolved)", async () => {
    signInAs("Owner");
    distinctActors.mockResolvedValue(["u2", "u1", "ghost"]);
    userNamesByIds.mockResolvedValue(
      new Map([
        ["u1", "Zed"],
        ["u2", "Ann"],
      ]),
    );
    const res = await auditService.listActorOptions();
    expect(res).toEqual([
      { id: "u2", name: "Ann" },
      { id: "ghost", name: "Unknown" },
      { id: "u1", name: "Zed" },
    ]);
  });
});
