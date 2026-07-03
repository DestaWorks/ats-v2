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
});
