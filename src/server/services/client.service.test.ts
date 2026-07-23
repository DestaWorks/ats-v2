import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves `clientService`'s DTO shaping (list/detail), the pipeline-snapshot aggregate math
 * (total/active/started/verified from `groupByStatusFiltered` + a separate verified count), and
 * that every mutation writes an audit row inside the shared transaction — all WITHOUT a DB.
 * Repositories, `writeAudit`, and `withTransaction` are mocked.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  owner: { id: "u1", email: "o@desta.works", name: "Owner", role: "Owner" as const },
  clientRepo: {
    list: vi.fn(),
    contactCounts: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contactRepo: {
    listForClient: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  taskRepo: {
    listForClient: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  meetingRepo: { listForClient: vi.fn(), create: vi.fn(), softDelete: vi.fn() },
  dealRepo: {
    listForClient: vi.fn(),
    create: vi.fn(),
    findById: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
  },
  blockerRepo: { listForDeal: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  candidateRepo: { groupByStatusFiltered: vi.fn(), count: vi.fn() },
  userRepo: { namesByIds: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/client-contact.repository", () => ({
  clientContactRepository: h.contactRepo,
}));
vi.mock("@/server/repositories/client-task.repository", () => ({
  clientTaskRepository: h.taskRepo,
}));
vi.mock("@/server/repositories/client-meeting.repository", () => ({
  clientMeetingRepository: h.meetingRepo,
}));
vi.mock("@/server/repositories/deal.repository", () => ({ dealRepository: h.dealRepo }));
vi.mock("@/server/repositories/deal-blocker.repository", () => ({
  dealBlockerRepository: h.blockerRepo,
}));
vi.mock("@/server/repositories/candidate.repository", () => ({
  candidateRepository: h.candidateRepo,
  FIRST_TERMINAL_ORDER: 9,
}));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { clientService } from "./client.service";

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    legacyId: null,
    name: "Sterling Institute",
    capacity: null,
    contact: null,
    location: null,
    priority: null,
    cadence: null,
    schedule: null,
    contractStart: null,
    renewalDate: null,
    states: [],
    specialties: [],
    services: [],
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    deletedAt: null,
    ...overrides,
  };
}

function contactRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cc1",
    clientId: "c1",
    fullName: "Jane Doe",
    title: "Practice Manager",
    role: "decision_maker",
    email: "jane@sterling.com",
    phone: null,
    linkedin: null,
    reportsTo: null,
    status: "active",
    notes: null,
    addedById: "u1",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ct1",
    clientId: "c1",
    title: "Follow up on contract renewal",
    dueDate: null,
    assignedToId: null,
    status: "open",
    completedAt: null,
    createdById: "u1",
    createdAt: new Date("2026-06-02T00:00:00.000Z"),
    updatedAt: new Date("2026-06-02T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

function meetingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cm1",
    clientId: "c1",
    type: "qbr",
    attendees: "Dr. Brown",
    notes: "Discussed Q3 hiring plans",
    actionItems: null,
    loggedById: "u1",
    createdAt: new Date("2026-06-03T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

function dealRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cd1",
    clientId: "c1",
    name: "Q3 renewal",
    stage: "Lead",
    estValue: 50000,
    expectedCloseDate: null,
    probabilityOverride: null,
    closedAt: null,
    closeReason: null,
    postMortem: null,
    createdById: "u1",
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

function blockerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "db1",
    dealId: "cd1",
    text: "Waiting on legal review",
    resolved: false,
    resolvedAt: null,
    createdAt: new Date("2026-06-05T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(h.clientRepo)) fn.mockReset();
  for (const fn of Object.values(h.contactRepo)) fn.mockReset();
  for (const fn of Object.values(h.taskRepo)) fn.mockReset();
  for (const fn of Object.values(h.meetingRepo)) fn.mockReset();
  for (const fn of Object.values(h.dealRepo)) fn.mockReset();
  for (const fn of Object.values(h.blockerRepo)) fn.mockReset();
  h.candidateRepo.groupByStatusFiltered.mockReset();
  h.candidateRepo.count.mockReset();
  h.userRepo.namesByIds.mockReset();
  h.writeAudit.mockReset();
  h.userRepo.namesByIds.mockResolvedValue(new Map([["u1", "Owner"]]));
  h.taskRepo.listForClient.mockResolvedValue([]);
  h.meetingRepo.listForClient.mockResolvedValue([]);
  h.dealRepo.listForClient.mockResolvedValue([]);
  h.blockerRepo.listForDeal.mockResolvedValue([]);
});

describe("clientService.list", () => {
  it("composes the client list with contact counts (0 when absent from the map)", async () => {
    h.clientRepo.list.mockResolvedValue([
      clientRow(),
      clientRow({ id: "c2", name: "Contemporary Care" }),
    ]);
    h.clientRepo.contactCounts.mockResolvedValue(new Map([["c1", 3]]));

    const out = await clientService.list();

    expect(out.clients).toHaveLength(2);
    expect(out.clients.find((c) => c.id === "c1")?.contactCount).toBe(3);
    expect(out.clients.find((c) => c.id === "c2")?.contactCount).toBe(0);
  });
});

describe("clientService.detail", () => {
  it("throws NOT_FOUND for a missing client (no further reads)", async () => {
    h.clientRepo.findById.mockResolvedValue(null);
    await expect(clientService.detail("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.contactRepo.listForClient).not.toHaveBeenCalled();
  });

  it("computes the pipeline snapshot from grouped statuses + a separate verified count", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.listForClient.mockResolvedValue([contactRow()]);
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([
      { status: "NEW_CANDIDATE", _count: { _all: 2 } }, // order 0, active
      { status: "QUALIFIED_PRESCREEN", _count: { _all: 3 } }, // order 1, active
      { status: "STARTED_DAY1", _count: { _all: 1 } }, // order 8, active + started
      { status: "NOT_QUALIFIED", _count: { _all: 4 } }, // terminal — not active
    ]);
    h.candidateRepo.count.mockResolvedValue(5); // verified

    const out = await clientService.detail("c1");

    expect(out.pipelineSnapshot).toEqual({ total: 10, active: 6, started: 1, verified: 5 });
    expect(h.candidateRepo.count).toHaveBeenCalledWith({ clientId: "c1", licenseStatus: "Active" });
  });

  it("resolves addedByName for each contact via a single batched namesByIds call", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.listForClient.mockResolvedValue([
      contactRow({ id: "cc1", addedById: "u1" }),
      contactRow({ id: "cc2", addedById: null }),
    ]);
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([]);
    h.candidateRepo.count.mockResolvedValue(0);

    const out = await clientService.detail("c1");

    expect(h.userRepo.namesByIds).toHaveBeenCalledWith(["u1"]);
    expect(out.contacts.find((c) => c.id === "cc1")?.addedByName).toBe("Owner");
    expect(out.contacts.find((c) => c.id === "cc2")?.addedByName).toBeNull();
  });

  it("composes the timeline from client/contact/task/meeting dates, newest first, capped", async () => {
    h.clientRepo.findById.mockResolvedValue(
      clientRow({ createdAt: new Date("2026-01-01T00:00:00.000Z") }),
    );
    h.contactRepo.listForClient.mockResolvedValue([
      contactRow({ createdAt: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    h.taskRepo.listForClient.mockResolvedValue([
      taskRow({
        title: "Send contract",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        completedAt: new Date("2026-03-05T00:00:00.000Z"),
      }),
    ]);
    h.meetingRepo.listForClient.mockResolvedValue([
      meetingRow({ createdAt: new Date("2026-04-01T00:00:00.000Z") }),
    ]);
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([]);
    h.candidateRepo.count.mockResolvedValue(0);

    const out = await clientService.detail("c1");

    // Newest first: meeting (Apr) > task completed (Mar 5) > task created (Mar 1) >
    // contact added (Feb) > client created (Jan).
    expect(out.timeline.map((e) => e.kind)).toEqual([
      "meeting_logged",
      "task_completed",
      "task_created",
      "contact_added",
      "client_created",
    ]);
    expect(out.timeline[1]).toMatchObject({
      kind: "task_completed",
      summary: "Task completed: Send contract",
    });
  });

  it("zips each deal with its OWN blockers (not cross-deal)", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.listForClient.mockResolvedValue([]);
    h.dealRepo.listForClient.mockResolvedValue([dealRow({ id: "cd1" }), dealRow({ id: "cd2" })]);
    h.blockerRepo.listForDeal.mockImplementation((dealId: string) =>
      Promise.resolve(dealId === "cd1" ? [blockerRow({ id: "db1", dealId: "cd1" })] : []),
    );
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([]);
    h.candidateRepo.count.mockResolvedValue(0);

    const out = await clientService.detail("c1");

    expect(out.deals.find((d) => d.id === "cd1")?.blockers).toHaveLength(1);
    expect(out.deals.find((d) => d.id === "cd2")?.blockers).toHaveLength(0);
  });

  it("includes deal_created/deal_closed timeline entries, won vs lost worded correctly", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.listForClient.mockResolvedValue([]);
    h.dealRepo.listForClient.mockResolvedValue([
      dealRow({
        id: "cd1",
        name: "Q3 renewal",
        stage: "Signed",
        createdAt: new Date("2026-05-01T00:00:00.000Z"),
        closedAt: new Date("2026-05-10T00:00:00.000Z"),
      }),
      dealRow({
        id: "cd2",
        name: "New wing staffing",
        stage: "Lost",
        createdAt: new Date("2026-05-02T00:00:00.000Z"),
        closedAt: new Date("2026-05-11T00:00:00.000Z"),
      }),
    ]);
    h.blockerRepo.listForDeal.mockResolvedValue([]);
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([]);
    h.candidateRepo.count.mockResolvedValue(0);

    const out = await clientService.detail("c1");

    const summaries = out.timeline.map((e) => e.summary);
    expect(summaries).toContain("Deal created: Q3 renewal");
    expect(summaries).toContain("Deal won: Q3 renewal");
    expect(summaries).toContain("Deal lost: New wing staffing");
  });

  it("caps the timeline at 40 entries", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.listForClient.mockResolvedValue([]);
    h.taskRepo.listForClient.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) =>
        taskRow({ id: `ct${i}`, createdAt: new Date(2026, 0, i + 1) }),
      ),
    );
    h.meetingRepo.listForClient.mockResolvedValue([]);
    h.candidateRepo.groupByStatusFiltered.mockResolvedValue([]);
    h.candidateRepo.count.mockResolvedValue(0);

    const out = await clientService.detail("c1");

    expect(out.timeline).toHaveLength(40);
  });
});

describe("clientService.create", () => {
  it("inserts the client and audits `create` in one txn", async () => {
    h.clientRepo.create.mockResolvedValue(clientRow());

    const out = await clientService.create({ name: "Sterling Institute" }, h.owner as AuthUser);

    const [data, tx] = h.clientRepo.create.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ name: "Sterling Institute" });
    const [atx, params] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(params).toMatchObject({ entity: "client", action: "create", actor: "u1" });
    expect(out.id).toBe("c1");
  });
});

describe("clientService.update", () => {
  it("throws NOT_FOUND for a missing client (no write)", async () => {
    h.clientRepo.findById.mockResolvedValue(null);
    await expect(
      clientService.update("nope", { location: "Hartford, CT" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.clientRepo.update).not.toHaveBeenCalled();
  });

  it("updates + audits with before/after names in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.clientRepo.update.mockResolvedValue(clientRow({ location: "Hartford, CT" }));

    await clientService.update("c1", { location: "Hartford, CT" }, h.owner as AuthUser);

    const [id, data, tx] = h.clientRepo.update.mock.calls[0]!;
    expect(id).toBe("c1");
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ location: "Hartford, CT" });
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("clientService.addContact", () => {
  it("throws NOT_FOUND when the client doesn't exist", async () => {
    h.clientRepo.findById.mockResolvedValue(null);
    await expect(
      clientService.addContact(
        "nope",
        { fullName: "Jane Doe", role: "unknown" },
        h.owner as AuthUser,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.contactRepo.create).not.toHaveBeenCalled();
  });

  it("creates the contact with addedById from the SESSION user, audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.create.mockResolvedValue(contactRow());

    const out = await clientService.addContact(
      "c1",
      { fullName: "Jane Doe", role: "decision_maker" },
      h.owner as AuthUser,
    );

    const [data, tx] = h.contactRepo.create.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ fullName: "Jane Doe", clientId: "c1", addedById: "u1" });
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(out.fullName).toBe("Jane Doe");
  });
});

describe("clientService.updateContact", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected (wrong client scope or missing)", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.update.mockResolvedValue(0);
    await expect(
      clientService.updateContact("c1", "cc-other-client", { status: "left" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("updates, re-reads, and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.update.mockResolvedValue(1);
    h.contactRepo.findById.mockResolvedValue(contactRow({ status: "left" }));

    const out = await clientService.updateContact(
      "c1",
      "cc1",
      { status: "left" },
      h.owner as AuthUser,
    );

    expect(out.status).toBe("left");
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("clientService.removeContact", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.softDelete.mockResolvedValue(0);
    await expect(
      clientService.removeContact("c1", "cc-missing", h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes with the actor id and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.contactRepo.softDelete.mockResolvedValue(1);

    await clientService.removeContact("c1", "cc1", h.owner as AuthUser);

    expect(h.contactRepo.softDelete).toHaveBeenCalledWith("c1", "cc1", "u1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("clientService.addTask", () => {
  it("throws NOT_FOUND when the client doesn't exist", async () => {
    h.clientRepo.findById.mockResolvedValue(null);
    await expect(
      clientService.addTask("nope", { title: "Follow up" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.taskRepo.create).not.toHaveBeenCalled();
  });

  it("creates the task with createdById from the SESSION user, audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.create.mockResolvedValue(taskRow());

    const out = await clientService.addTask("c1", { title: "Follow up" }, h.owner as AuthUser);

    const [data, tx] = h.taskRepo.create.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ title: "Follow up", clientId: "c1", createdById: "u1" });
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(out.status).toBe("open");
  });
});

describe("clientService.updateTask", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.update.mockResolvedValue(0);
    await expect(
      clientService.updateTask("c1", "ct-other-client", { status: "done" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stamps completedAt when the status transitions to done", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.update.mockResolvedValue(1);
    h.taskRepo.findById.mockResolvedValue(taskRow({ status: "done", completedAt: new Date() }));

    await clientService.updateTask("c1", "ct1", { status: "done" }, h.owner as AuthUser);

    const [, , data] = h.taskRepo.update.mock.calls[0]!;
    expect(data.status).toBe("done");
    expect(data.completedAt).toBeInstanceOf(Date);
  });

  it("clears completedAt when the status transitions back to open", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.update.mockResolvedValue(1);
    h.taskRepo.findById.mockResolvedValue(taskRow({ status: "open", completedAt: null }));

    await clientService.updateTask("c1", "ct1", { status: "open" }, h.owner as AuthUser);

    const [, , data] = h.taskRepo.update.mock.calls[0]!;
    expect(data.status).toBe("open");
    expect(data.completedAt).toBeNull();
  });

  it("leaves completedAt untouched when status isn't part of the update", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.update.mockResolvedValue(1);
    h.taskRepo.findById.mockResolvedValue(taskRow({ title: "Renamed" }));

    await clientService.updateTask("c1", "ct1", { title: "Renamed" }, h.owner as AuthUser);

    const [, , data] = h.taskRepo.update.mock.calls[0]!;
    expect(data).not.toHaveProperty("completedAt");
  });
});

describe("clientService.removeTask", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.softDelete.mockResolvedValue(0);
    await expect(
      clientService.removeTask("c1", "ct-missing", h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes with the actor id and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.taskRepo.softDelete.mockResolvedValue(1);

    await clientService.removeTask("c1", "ct1", h.owner as AuthUser);

    expect(h.taskRepo.softDelete).toHaveBeenCalledWith("c1", "ct1", "u1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("clientService.addMeeting", () => {
  it("throws NOT_FOUND when the client doesn't exist", async () => {
    h.clientRepo.findById.mockResolvedValue(null);
    await expect(
      clientService.addMeeting("nope", { type: "qbr" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.meetingRepo.create).not.toHaveBeenCalled();
  });

  it("creates the meeting with loggedById from the SESSION user, audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.meetingRepo.create.mockResolvedValue(meetingRow());

    const out = await clientService.addMeeting("c1", { type: "qbr" }, h.owner as AuthUser);

    const [data, tx] = h.meetingRepo.create.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ type: "qbr", clientId: "c1", loggedById: "u1" });
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(out.type).toBe("qbr");
  });
});

describe("clientService.removeMeeting", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.meetingRepo.softDelete.mockResolvedValue(0);
    await expect(
      clientService.removeMeeting("c1", "cm-missing", h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes with the actor id and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.meetingRepo.softDelete.mockResolvedValue(1);

    await clientService.removeMeeting("c1", "cm1", h.owner as AuthUser);

    expect(h.meetingRepo.softDelete).toHaveBeenCalledWith("c1", "cm1", "u1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("clientService.addDeal", () => {
  it("throws NOT_FOUND when the client doesn't exist", async () => {
    h.clientRepo.findById.mockResolvedValue(null);
    await expect(
      clientService.addDeal("nope", { name: "Q3 renewal" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.dealRepo.create).not.toHaveBeenCalled();
  });

  it("creates the deal with createdById from the SESSION user, audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.create.mockResolvedValue(dealRow());

    const out = await clientService.addDeal("c1", { name: "Q3 renewal" }, h.owner as AuthUser);

    const [data, tx] = h.dealRepo.create.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ name: "Q3 renewal", clientId: "c1", createdById: "u1" });
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(out.stage).toBe("Lead");
    expect(out.blockers).toEqual([]);
  });
});

describe("clientService.updateDeal", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.update.mockResolvedValue(0);
    await expect(
      clientService.updateDeal("c1", "cd-other-client", { stage: "Signed" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stamps closedAt when the stage transitions to Signed", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.update.mockResolvedValue(1);
    h.dealRepo.findById.mockResolvedValue(dealRow({ stage: "Signed", closedAt: new Date() }));
    h.blockerRepo.listForDeal.mockResolvedValue([]);

    await clientService.updateDeal("c1", "cd1", { stage: "Signed" }, h.owner as AuthUser);

    const [, , data] = h.dealRepo.update.mock.calls[0]!;
    expect(data.stage).toBe("Signed");
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it("stamps closedAt when the stage transitions to Lost", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.update.mockResolvedValue(1);
    h.dealRepo.findById.mockResolvedValue(dealRow({ stage: "Lost", closedAt: new Date() }));
    h.blockerRepo.listForDeal.mockResolvedValue([]);

    await clientService.updateDeal("c1", "cd1", { stage: "Lost" }, h.owner as AuthUser);

    const [, , data] = h.dealRepo.update.mock.calls[0]!;
    expect(data.stage).toBe("Lost");
    expect(data.closedAt).toBeInstanceOf(Date);
  });

  it("clears closedAt when the stage moves back to an open stage", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.update.mockResolvedValue(1);
    h.dealRepo.findById.mockResolvedValue(dealRow({ stage: "Negotiation", closedAt: null }));
    h.blockerRepo.listForDeal.mockResolvedValue([]);

    await clientService.updateDeal("c1", "cd1", { stage: "Negotiation" }, h.owner as AuthUser);

    const [, , data] = h.dealRepo.update.mock.calls[0]!;
    expect(data.stage).toBe("Negotiation");
    expect(data.closedAt).toBeNull();
  });

  it("leaves closedAt untouched when stage isn't part of the update", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.update.mockResolvedValue(1);
    h.dealRepo.findById.mockResolvedValue(dealRow({ estValue: 75000 }));
    h.blockerRepo.listForDeal.mockResolvedValue([]);

    await clientService.updateDeal("c1", "cd1", { estValue: 75000 }, h.owner as AuthUser);

    const [, , data] = h.dealRepo.update.mock.calls[0]!;
    expect(data).not.toHaveProperty("closedAt");
  });
});

describe("clientService.removeDeal", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.softDelete.mockResolvedValue(0);
    await expect(
      clientService.removeDeal("c1", "cd-missing", h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("soft-deletes with the actor id and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.softDelete.mockResolvedValue(1);

    await clientService.removeDeal("c1", "cd1", h.owner as AuthUser);

    expect(h.dealRepo.softDelete).toHaveBeenCalledWith("c1", "cd1", "u1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});

describe("clientService.addBlocker", () => {
  it("throws NOT_FOUND when the deal doesn't exist or belongs to another client", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow({ clientId: "OTHER_CLIENT" }));
    await expect(
      clientService.addBlocker("c1", "cd1", { text: "Blocked" }, h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.blockerRepo.create).not.toHaveBeenCalled();
  });

  it("creates the blocker and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow());
    h.blockerRepo.create.mockResolvedValue(blockerRow());

    const out = await clientService.addBlocker(
      "c1",
      "cd1",
      { text: "Waiting on legal review" },
      h.owner as AuthUser,
    );

    const [data, tx] = h.blockerRepo.create.mock.calls[0]!;
    expect(tx).toBe(h.fakeTx);
    expect(data).toMatchObject({ text: "Waiting on legal review", dealId: "cd1" });
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
    expect(out.resolved).toBe(false);
  });
});

describe("clientService.updateBlocker", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow());
    h.blockerRepo.update.mockResolvedValue(0);
    await expect(
      clientService.updateBlocker(
        "c1",
        "cd1",
        "db-missing",
        { resolved: true },
        h.owner as AuthUser,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stamps resolvedAt when resolved: true", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow());
    h.blockerRepo.update.mockResolvedValue(1);
    h.blockerRepo.listForDeal.mockResolvedValue([
      blockerRow({ resolved: true, resolvedAt: new Date() }),
    ]);

    await clientService.updateBlocker("c1", "cd1", "db1", { resolved: true }, h.owner as AuthUser);

    const [, , data] = h.blockerRepo.update.mock.calls[0]!;
    expect(data.resolved).toBe(true);
    expect(data.resolvedAt).toBeInstanceOf(Date);
  });

  it("clears resolvedAt when resolved: false", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow());
    h.blockerRepo.update.mockResolvedValue(1);
    h.blockerRepo.listForDeal.mockResolvedValue([
      blockerRow({ resolved: false, resolvedAt: null }),
    ]);

    await clientService.updateBlocker("c1", "cd1", "db1", { resolved: false }, h.owner as AuthUser);

    const [, , data] = h.blockerRepo.update.mock.calls[0]!;
    expect(data.resolved).toBe(false);
    expect(data.resolvedAt).toBeNull();
  });
});

describe("clientService.removeBlocker", () => {
  it("throws NOT_FOUND when the repo reports 0 rows affected", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow());
    h.blockerRepo.delete.mockResolvedValue(0);
    await expect(
      clientService.removeBlocker("c1", "cd1", "db-missing", h.owner as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deletes and audits in one txn", async () => {
    h.clientRepo.findById.mockResolvedValue(clientRow());
    h.dealRepo.findById.mockResolvedValue(dealRow());
    h.blockerRepo.delete.mockResolvedValue(1);

    await clientService.removeBlocker("c1", "cd1", "db1", h.owner as AuthUser);

    expect(h.blockerRepo.delete).toHaveBeenCalledWith("cd1", "db1", h.fakeTx);
    expect(h.writeAudit).toHaveBeenCalledTimes(1);
  });
});
