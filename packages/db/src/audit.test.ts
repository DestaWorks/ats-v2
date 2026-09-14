import { describe, it, expect, vi } from "vitest";

// `server-only` throws outside an RSC build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

import { writeAudit } from "./audit";

describe("writeAudit", () => {
  it("inserts one activity_log row with the given shape, using the passed tx", async () => {
    const create = vi.fn();
    const tx = { activityLog: { create } } as unknown as Parameters<typeof writeAudit>[0];

    writeAudit(tx, {
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "stage.advance",
      before: { status: "0 - New Candidate" },
      after: { status: "1 - Screening" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        entity: "candidate",
        entityId: "c1",
        actor: "u1",
        action: "stage.advance",
        before: { status: "0 - New Candidate" },
        after: { status: "1 - Screening" },
      },
    });
  });

  it("omits before/after when not provided", () => {
    const create = vi.fn();
    const tx = { activityLog: { create } } as unknown as Parameters<typeof writeAudit>[0];

    writeAudit(tx, { entity: "client", entityId: "cl1", actor: "u2", action: "client.create" });

    expect(create).toHaveBeenCalledWith({
      data: {
        entity: "client",
        entityId: "cl1",
        actor: "u2",
        action: "client.create",
        before: undefined,
        after: undefined,
      },
    });
  });

  it("redacts sensitive PII/PHI fields (H1) instead of writing plaintext", () => {
    const create = vi.fn();
    const tx = { activityLog: { create } } as unknown as Parameters<typeof writeAudit>[0];

    writeAudit(tx, {
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "update",
      before: { licenseNumber: "PMH-12345", email: "old@x.com", name: "Jane Doe" },
      after: { licenseNumber: "PMH-67890", email: "new@x.com", name: "Jane Doe" },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: { licenseNumber: "[REDACTED]", email: "[REDACTED]", name: "Jane Doe" },
        after: { licenseNumber: "[REDACTED]", email: "[REDACTED]", name: "Jane Doe" },
      }),
    });
  });

  it("leaves null/undefined sensitive fields as-is (nothing to redact)", () => {
    const create = vi.fn();
    const tx = { activityLog: { create } } as unknown as Parameters<typeof writeAudit>[0];

    writeAudit(tx, {
      entity: "candidate",
      entityId: "c1",
      actor: "u1",
      action: "update",
      after: { licenseNumber: null, phone: undefined, status: "1 - Screening" },
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after: { licenseNumber: null, phone: undefined, status: "1 - Screening" },
      }),
    });
  });
});

/**
 * The tenant contract, tested here rather than in the 21 service suites that mock this module.
 *
 * `activity_log.tenantId` is NOT NULL. On a client from `db(ctx, tx)` the seam stamps it and the
 * caller must not; on the raw client `withAnnouncedTenant`/`withTransaction` yield there is no
 * seam, so the caller must name it or Postgres rejects the row. Getting that wrong shipped once:
 * six admin mutations wrote through a raw client without a tenant, so each landed its Better Auth
 * call and then 500'd on the audit — the destructive half committed, the record of it did not.
 *
 * `scripts/check-tenant-scope.mjs` catches the static shape. These cover the contract itself.
 */
describe("writeAudit — the tenant contract", () => {
  function txSpy() {
    const create = vi.fn();
    return {
      create,
      tx: { activityLog: { create } } as unknown as Parameters<typeof writeAudit>[0],
    };
  }

  it("passes tenantId straight through when the caller names one", () => {
    const { create, tx } = txSpy();
    writeAudit(tx, {
      entity: "user",
      entityId: "u1",
      actor: "a1",
      action: "create",
      tenantId: "t1",
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({ tenantId: "t1" });
  });

  // Passing `tenantId: undefined` is unrepresentable — `exactOptionalPropertyTypes` rejects it,
  // so the only way to omit it is to leave the key out, which is what this covers.
  it("omits tenantId entirely when the caller names none, leaving it to the seam", () => {
    const { create, tx } = txSpy();
    writeAudit(tx, { entity: "user", entityId: "u1", actor: "a1", action: "create" });
    expect(create.mock.calls[0]![0].data).not.toHaveProperty("tenantId");
  });

  it("redacts before it stamps, so a tenant-named row is no less redacted", () => {
    const { create, tx } = txSpy();
    writeAudit(tx, {
      entity: "candidate",
      entityId: "c1",
      actor: "a1",
      action: "update",
      tenantId: "t1",
      after: { email: "jane@example.test", name: "Jane" },
    });
    expect(create.mock.calls[0]![0].data).toMatchObject({
      tenantId: "t1",
      after: { email: "[REDACTED]", name: "Jane" },
    });
  });
});
