import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Proves the capability gate on audit reads: `activity_log` rows can hold PII/PHI, so only
 * holders of `viewAudit` (admin-only) may read the trail. We exercise the REAL guard (`requireCapability`)
 * by mocking the Better Auth session + `next/headers` (same pattern as `guards.test.ts`) and
 * stub the repository so no DB is touched — the role always comes from the (mocked) session.
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
vi.mock("@/server/repositories/audit.repository", () => ({
  auditRepository: { listForEntity: (...args: unknown[]) => listForEntity(...args) },
}));

import { auditService } from "./audit.service";

function signInAs(role?: string) {
  mockSession = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeEach(() => {
  mockSession = null;
  listForEntity.mockReset();
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
