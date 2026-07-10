import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AuthUser } from "@/server/auth/guards";

/**
 * Proves the source-lead service's state-machine writes WITHOUT a DB. The pure `lead-lifecycle`
 * rules run for real; the repositories, `candidateService.create`, `writeAudit`, and
 * `withTransaction` (runs the callback with a fake `tx`) are mocked. Every mutation composes its
 * writes in ONE transaction; the terminal/idempotency guards (Promoted → CONFLICT, missing → 404)
 * are asserted to short-circuit before any write.
 */

const h = vi.hoisted(() => ({
  fakeTx: { __tx: true },
  user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" as const },
  leadRepo: {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    markPromoted: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    logOutreach: vi.fn(),
    listOutreach: vi.fn(),
    updateOutreachAttempt: vi.fn(),
    deleteOutreachAttempt: vi.fn(),
    syncOutreachDenorm: vi.fn(),
    findManyByIds: vi.fn(),
    findManyByEmails: vi.fn(),
    findManyByNames: vi.fn(),
    createMany: vi.fn(),
  },
  clientRepo: { list: vi.fn() },
  userRepo: { namesByIds: vi.fn() },
  candidateService: { create: vi.fn() },
  writeAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/repositories/lead.repository", () => ({ leadRepository: h.leadRepo }));
vi.mock("@/server/repositories/client.repository", () => ({ clientRepository: h.clientRepo }));
vi.mock("@/server/repositories/user.repository", () => ({ userRepository: h.userRepo }));
vi.mock("@/server/services/candidate.service", () => ({ candidateService: h.candidateService }));
vi.mock("@/server/db/audit", () => ({ writeAudit: h.writeAudit }));
vi.mock("@/server/db/with-transaction", () => ({
  withTransaction: (fn: (tx: unknown) => unknown) => fn(h.fakeTx),
}));

import { leadService } from "./lead.service";

/** A source-lead row with the fields the service reads. */
function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    name: "Jane Doe",
    email: "jane@example.com",
    phone: "555-0100",
    linkedinUrl: null,
    credential: "PMHNP",
    state: "NJ",
    source: "LinkedIn",
    tags: ["Priority"],
    notes: null,
    clientId: "cl1",
    status: "Sourced",
    outreachCount: 0,
    lastOutreachAt: null,
    respondedAt: null,
    promotedCandidateId: null,
    createdById: "u1",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    deletedAt: null,
    deletedById: null,
    ...overrides,
  };
}

beforeEach(() => {
  for (const fn of Object.values(h.leadRepo)) fn.mockReset();
  h.clientRepo.list.mockReset();
  h.userRepo.namesByIds.mockReset();
  h.candidateService.create.mockReset();
  h.writeAudit.mockReset();
  // loadDetail defaults (individual tests override as needed).
  h.leadRepo.listOutreach.mockResolvedValue([]);
  h.clientRepo.list.mockResolvedValue([{ id: "cl1", name: "Acme Health" }]);
  h.userRepo.namesByIds.mockResolvedValue(new Map());
});

describe("leadService.create", () => {
  it("inserts the lead (status Sourced, count 0, createdById) + audits `create` in one txn", async () => {
    h.leadRepo.create.mockResolvedValue(lead());
    const detail = await leadService.create(
      { name: "Jane Doe", email: "jane@example.com", source: "LinkedIn" },
      h.user as AuthUser,
    );

    const [data, ctx] = h.leadRepo.create.mock.calls[0]!;
    expect(ctx).toBe(h.fakeTx);
    expect(data).toMatchObject({
      name: "Jane Doe",
      status: "Sourced",
      outreachCount: 0,
      createdById: "u1",
    });

    const [atx, params] = h.writeAudit.mock.calls[0]!;
    expect(atx).toBe(h.fakeTx);
    expect(params).toMatchObject({
      entity: "source_lead",
      entityId: "l1",
      actor: "u1",
      action: "create",
    });

    expect(detail.id).toBe("l1");
    expect(detail.targetClientName).toBe("Acme Health");
    expect(detail.attempts).toEqual([]);
  });
});

describe("leadService.list", () => {
  it("serves one OFFSET page — filters forwarded, page CLAMPED, pager meta honest", async () => {
    h.leadRepo.list.mockResolvedValue([lead()]);
    h.leadRepo.count.mockResolvedValue(60); // → 3 pages of 25

    // Requested page 9 clamps to the last page (3).
    const out = await leadService.list({
      status: "Sourced",
      source: "LinkedIn",
      clientId: "cl1",
      ownerId: "u2",
      search: "jane",
      page: 9,
    });

    const [countFilters] = h.leadRepo.count.mock.calls[0]!;
    expect(countFilters).toMatchObject({
      status: "Sourced",
      source: "LinkedIn",
      clientId: "cl1",
      createdById: "u2", // ownerId maps to the repo's createdById
      search: "jane",
    });
    const [listFilters] = h.leadRepo.list.mock.calls[0]!;
    expect(listFilters).toMatchObject({ skip: 50, take: 25 }); // (3-1)*25

    expect(out).toMatchObject({
      total: 60,
      page: 3,
      pageSize: 25,
      totalPages: 3,
      hasPrev: true,
      hasNext: false,
    });
    expect(out.leads[0]!.targetClientName).toBe("Acme Health");
  });

  it("defaults to page 1 (skip 0); a single short page has no prev/next", async () => {
    h.leadRepo.list.mockResolvedValue([lead()]);
    h.leadRepo.count.mockResolvedValue(1);
    const out = await leadService.list({});
    const [listFilters] = h.leadRepo.list.mock.calls[0]!;
    expect(listFilters).toMatchObject({ skip: 0, take: 25 });
    expect(out).toMatchObject({ page: 1, totalPages: 1, hasPrev: false, hasNext: false });
  });
});

describe("leadService.logOutreach", () => {
  it("advances the status, bumps the count, adds the attempt + audit in one txn", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Sourced", outreachCount: 0 }));
    h.leadRepo.logOutreach.mockResolvedValue({
      attempt: { id: "a1" },
      lead: lead({ status: "Outreach 1", outreachCount: 1 }),
    });

    await leadService.logOutreach("l1", { channel: "email", note: "hi" }, h.user as AuthUser);

    const [params, ltx] = h.leadRepo.logOutreach.mock.calls[0]!;
    expect(ltx).toBe(h.fakeTx);
    expect(params).toMatchObject({
      leadId: "l1",
      channel: "email",
      actorId: "u1",
      status: "Outreach 1",
    });
    expect(params.at).toBeInstanceOf(Date);

    const [, audit] = h.writeAudit.mock.calls[0]!;
    expect(audit).toMatchObject({
      action: "log_outreach",
      entity: "source_lead",
      entityId: "l1",
      actor: "u1",
    });
    expect(audit.after).toMatchObject({ status: "Outreach 1", channel: "email" });
  });

  it("HOLDS status at Outreach 3 (Final) but still records the attempt (count increments)", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Outreach 3 (Final)", outreachCount: 3 }));
    h.leadRepo.logOutreach.mockResolvedValue({
      attempt: { id: "a4" },
      lead: lead({ status: "Outreach 3 (Final)", outreachCount: 4 }),
    });

    await leadService.logOutreach("l1", { channel: "phone" }, h.user as AuthUser);

    const [params] = h.leadRepo.logOutreach.mock.calls[0]!;
    expect(params.status).toBe("Outreach 3 (Final)"); // capped — status holds
    expect(h.leadRepo.logOutreach).toHaveBeenCalledTimes(1); // attempt still written
  });

  it("throws CONFLICT (no write) when the lead is already Promoted", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Promoted" }));
    await expect(
      leadService.logOutreach("l1", { channel: "email" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(h.leadRepo.logOutreach).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when the lead is missing/soft-deleted", async () => {
    h.leadRepo.findById.mockResolvedValue(null);
    await expect(
      leadService.logOutreach("missing", { channel: "email" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.leadRepo.logOutreach).not.toHaveBeenCalled();
  });
});

describe("leadService.respond", () => {
  it("sets Responded — Hot + stamps respondedAt once, audits `respond` in one txn", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Outreach 2", respondedAt: null }));
    h.leadRepo.update.mockResolvedValue(lead({ status: "Responded — Hot" }));

    await leadService.respond("l1", "hot", h.user as AuthUser);

    const [uid, data, utx] = h.leadRepo.update.mock.calls[0]!;
    expect(uid).toBe("l1");
    expect(utx).toBe(h.fakeTx);
    expect(data.status).toBe("Responded — Hot");
    expect(data.respondedAt).toBeInstanceOf(Date);

    const [, audit] = h.writeAudit.mock.calls[0]!;
    expect(audit).toMatchObject({ action: "respond", entityId: "l1" });
    expect(audit.after).toMatchObject({ status: "Responded — Hot" });
  });

  it("preserves the original respondedAt on a re-response (Hot → Cold)", async () => {
    const respondedAt = new Date("2026-06-05T00:00:00.000Z");
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Responded — Hot", respondedAt }));
    h.leadRepo.update.mockResolvedValue(lead({ status: "Responded — Cold", respondedAt }));

    await leadService.respond("l1", "cold", h.user as AuthUser);

    const [, data] = h.leadRepo.update.mock.calls[0]!;
    expect(data.status).toBe("Responded — Cold");
    expect(data.respondedAt).toBe(respondedAt); // not overwritten
  });

  it("throws CONFLICT (no write) on a Promoted lead", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Promoted" }));
    await expect(leadService.respond("l1", "hot", h.user as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.leadRepo.update).not.toHaveBeenCalled();
  });
});

describe("leadService.promote", () => {
  it("creates the candidate via candidateService.create, flips the lead to Promoted + back-links, audits — all in one txn", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Responded — Hot" }));
    h.candidateService.create.mockResolvedValue({ id: "c-new", status: "NEW_CANDIDATE" });
    h.leadRepo.markPromoted.mockResolvedValue(1); // won the flip

    const result = await leadService.promote("l1", h.user as AuthUser);
    expect(result).toEqual({ candidateId: "c-new" });

    // candidate create — composed inside the promote tx, with the authed user (forced-field contract reused)
    const [input, opts] = h.candidateService.create.mock.calls[0]!;
    expect(input).toMatchObject({
      name: "Jane Doe",
      credential: "PMHNP",
      state: "NJ",
      clientId: "cl1",
    });
    expect(opts).toEqual({ user: h.user, tx: h.fakeTx });

    // lead flip — guarded conditional update, same tx
    const [uid, cid, utx] = h.leadRepo.markPromoted.mock.calls[0]!;
    expect(uid).toBe("l1");
    expect(cid).toBe("c-new");
    expect(utx).toBe(h.fakeTx);

    const [, audit] = h.writeAudit.mock.calls[0]!;
    expect(audit).toMatchObject({ action: "promote", entity: "source_lead", entityId: "l1" });
    expect(audit.after).toMatchObject({ status: "Promoted", candidateId: "c-new" });
  });

  it("throws CONFLICT on an already-Promoted lead — no candidate created (no double-promote)", async () => {
    h.leadRepo.findById.mockResolvedValue(
      lead({ status: "Promoted", promotedCandidateId: "c-old" }),
    );
    await expect(leadService.promote("l1", h.user as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.candidateService.create).not.toHaveBeenCalled();
    expect(h.leadRepo.markPromoted).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("throws CONFLICT if a concurrent promote won the flip (markPromoted → 0) — no orphan candidate", async () => {
    // The pre-check passes, but the in-tx guarded flip finds the lead already Promoted → 0 rows.
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Responded — Hot" }));
    h.candidateService.create.mockResolvedValue({ id: "c-new", status: "NEW_CANDIDATE" });
    h.leadRepo.markPromoted.mockResolvedValue(0); // lost the race

    await expect(leadService.promote("l1", h.user as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // the candidate create ran but the CONFLICT throw rolls back the whole tx (no orphan); no audit
    expect(h.writeAudit).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND on a missing/soft-deleted lead", async () => {
    h.leadRepo.findById.mockResolvedValue(null);
    await expect(leadService.promote("missing", h.user as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.candidateService.create).not.toHaveBeenCalled();
  });
});

describe("leadService.softDelete", () => {
  it("sets deletedAt/deletedById via the repo + audits `delete` in one txn", async () => {
    const deletedAt = new Date();
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Outreach 1" }));
    h.leadRepo.softDelete.mockResolvedValue(lead({ deletedAt, deletedById: "u1" }));

    const result = await leadService.softDelete("l1", h.user as AuthUser);
    expect(result).toEqual({ id: "l1" });

    const [sid, actor, stx] = h.leadRepo.softDelete.mock.calls[0]!;
    expect(sid).toBe("l1");
    expect(actor).toBe("u1");
    expect(stx).toBe(h.fakeTx);

    const [, audit] = h.writeAudit.mock.calls[0]!;
    expect(audit).toMatchObject({
      action: "delete",
      entity: "source_lead",
      entityId: "l1",
      actor: "u1",
    });
  });

  it("throws NOT_FOUND when missing or already-trashed (idempotent)", async () => {
    h.leadRepo.findById.mockResolvedValue(null);
    await expect(leadService.softDelete("missing", h.user as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(h.leadRepo.softDelete).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("leadService.restore", () => {
  it("clears the delete markers + audits `restore` in one txn; status untouched", async () => {
    const deletedAt = new Date("2026-07-01T00:00:00.000Z");
    h.leadRepo.findById.mockResolvedValue(
      lead({ status: "Outreach 2", deletedAt, deletedById: "u9" }),
    );
    h.leadRepo.restore.mockResolvedValue(lead({ status: "Outreach 2" }));

    const detail = await leadService.restore("l1", h.user as AuthUser);
    expect(detail.status).toBe("Outreach 2"); // exactly as it left
    expect(detail.deletedAt).toBeNull();

    // findById must INCLUDE trashed rows (that's the whole point).
    expect(h.leadRepo.findById.mock.calls[0]![1]).toMatchObject({ includeDeleted: true });
    const [rid, rtx] = h.leadRepo.restore.mock.calls[0]!;
    expect(rid).toBe("l1");
    expect(rtx).toBe(h.fakeTx);

    const [, audit] = h.writeAudit.mock.calls[0]!;
    expect(audit).toMatchObject({
      action: "restore",
      entity: "source_lead",
      entityId: "l1",
      actor: "u1",
      before: { deletedAt, deletedById: "u9" },
    });
  });

  it("NOT_FOUND when missing; CONFLICT when the lead is not deleted", async () => {
    h.leadRepo.findById.mockResolvedValue(null);
    await expect(leadService.restore("missing", h.user as AuthUser)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    h.leadRepo.findById.mockResolvedValue(lead()); // live lead — deletedAt null
    await expect(leadService.restore("l1", h.user as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(h.leadRepo.restore).not.toHaveBeenCalled();
    expect(h.writeAudit).not.toHaveBeenCalled();
  });
});

describe("leadService.snooze", () => {
  it("sets snoozedUntil + audits `snooze`; wake (null) audits `wake`", async () => {
    const until = new Date("2026-07-20T00:00:00.000Z");
    h.leadRepo.findById.mockResolvedValue(lead());
    h.leadRepo.update.mockResolvedValue(lead({ snoozedUntil: until }));

    const detail = await leadService.snooze("l1", until, h.user as AuthUser);
    expect(h.leadRepo.update).toHaveBeenCalledWith("l1", { snoozedUntil: until }, h.fakeTx);
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "snooze" });
    expect(detail.snoozedUntil).toBe("2026-07-20T00:00:00.000Z");

    h.leadRepo.update.mockResolvedValue(lead({ snoozedUntil: null }));
    await leadService.snooze("l1", null, h.user as AuthUser);
    expect(h.writeAudit.mock.calls[1]![1]).toMatchObject({ action: "wake" });
  });

  it("rejects snoozing a Promoted lead (CONFLICT); wake stays allowed", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Promoted" }));
    await expect(leadService.snooze("l1", new Date(), h.user as AuthUser)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    h.leadRepo.update.mockResolvedValue(lead({ status: "Promoted", snoozedUntil: null }));
    await expect(leadService.snooze("l1", null, h.user as AuthUser)).resolves.toBeTruthy();
  });
});

describe("leadService outreach edit/delete", () => {
  it("updateOutreach patches the scoped attempt, re-syncs denorm, audits — status untouched", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Outreach 2" }));
    h.leadRepo.updateOutreachAttempt.mockResolvedValue(1);
    h.leadRepo.syncOutreachDenorm.mockResolvedValue(lead({ status: "Outreach 2" }));

    await leadService.updateOutreach("l1", "a1", { note: "corrected" }, h.user as AuthUser);
    expect(h.leadRepo.updateOutreachAttempt).toHaveBeenCalledWith(
      "l1",
      "a1",
      { note: "corrected" },
      h.fakeTx,
    );
    expect(h.leadRepo.syncOutreachDenorm).toHaveBeenCalledWith("l1", h.fakeTx);
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "edit_outreach" });
  });

  it("an attempt under a DIFFERENT lead → NOT_FOUND (0-row scoped write)", async () => {
    h.leadRepo.findById.mockResolvedValue(lead());
    h.leadRepo.updateOutreachAttempt.mockResolvedValue(0);
    await expect(
      leadService.updateOutreach("l1", "not-mine", { note: "x" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("deleteOutreach removes the attempt + re-syncs; status is NOT regressed", async () => {
    h.leadRepo.findById.mockResolvedValue(lead({ status: "Outreach 3", outreachCount: 3 }));
    h.leadRepo.deleteOutreachAttempt.mockResolvedValue(1);
    h.leadRepo.syncOutreachDenorm.mockResolvedValue(
      lead({ status: "Outreach 3", outreachCount: 2 }),
    );

    const detail = await leadService.deleteOutreach("l1", "a1", h.user as AuthUser);
    expect(h.leadRepo.deleteOutreachAttempt).toHaveBeenCalledWith("l1", "a1", h.fakeTx);
    expect(detail.status).toBe("Outreach 3"); // never regressed by a delete
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({ action: "delete_outreach" });
  });
});

describe("leadService.bulkAction", () => {
  it("status: applies to eligible leads, SKIPS Promoted, audits per lead", async () => {
    h.leadRepo.findManyByIds.mockResolvedValue([
      lead({ id: "l1", status: "Sourced" }),
      lead({ id: "l2", status: "Promoted" }),
    ]);
    h.leadRepo.update.mockResolvedValue(lead());

    const out = await leadService.bulkAction(
      { action: "status", ids: ["l1", "l2", "l1"], value: "Outreach 1" },
      h.user as AuthUser,
    );

    expect(out).toEqual({ affected: 1, skipped: 1 }); // duplicate id collapsed; Promoted skipped
    expect(h.leadRepo.update).toHaveBeenCalledTimes(1);
    expect(h.leadRepo.update).toHaveBeenCalledWith("l1", { status: "Outreach 1" }, h.fakeTx);
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({
      entityId: "l1",
      action: "bulk_status",
    });
  });

  it("assign validates the user exists ONCE and re-points createdById", async () => {
    h.leadRepo.findManyByIds.mockResolvedValue([lead({ id: "l1" })]);
    h.userRepo.namesByIds.mockResolvedValue(new Map([["u2", "Biruh"]]));
    h.leadRepo.update.mockResolvedValue(lead());

    await leadService.bulkAction(
      { action: "assign", ids: ["l1"], value: "u2" },
      h.user as AuthUser,
    );
    expect(h.leadRepo.update).toHaveBeenCalledWith("l1", { createdById: "u2" }, h.fakeTx);

    h.userRepo.namesByIds.mockResolvedValue(new Map());
    await expect(
      leadService.bulkAction({ action: "assign", ids: ["l1"], value: "ghost" }, h.user as AuthUser),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("restore only touches actually-deleted rows", async () => {
    h.leadRepo.findManyByIds.mockResolvedValue([
      lead({ id: "l1", deletedAt: new Date() }),
      lead({ id: "l2", deletedAt: null }),
    ]);
    h.leadRepo.restore.mockResolvedValue(lead());

    const out = await leadService.bulkAction(
      { action: "restore", ids: ["l1", "l2"] },
      h.user as AuthUser,
    );
    expect(out).toEqual({ affected: 1, skipped: 1 });
    expect(h.leadRepo.restore).toHaveBeenCalledWith("l1", h.fakeTx);
    // restore must resolve rows INCLUDING deleted ones.
    expect(h.leadRepo.findManyByIds).toHaveBeenCalledWith(["l1", "l2"], { includeDeleted: true });
  });

  it("outreach: logs per eligible lead with its OWN advanced status", async () => {
    h.leadRepo.findManyByIds.mockResolvedValue([
      lead({ id: "l1", status: "Sourced" }),
      lead({ id: "l2", status: "Outreach 3" }),
    ]);
    h.leadRepo.logOutreach.mockResolvedValue({ lead: lead(), attempt: { id: "a1" } });

    await leadService.bulkAction(
      { action: "outreach", ids: ["l1", "l2"], channel: "email", note: null },
      h.user as AuthUser,
    );

    const statuses = h.leadRepo.logOutreach.mock.calls.map((c) => c[0].status);
    expect(statuses).toEqual(["Outreach 1", "Outreach 3"]); // advances; caps at O3
  });
});

describe("leadService.importLeads", () => {
  it("dedupes by email (existing + intra-batch) and by name for email-less rows", async () => {
    h.leadRepo.findManyByEmails.mockResolvedValue([
      { id: "x", email: "taken@x.com", name: "Taken", phone: null },
    ]);
    h.leadRepo.findManyByNames.mockResolvedValue([
      { id: "y", email: null, name: "Existing Nameless", phone: null },
    ]);
    h.leadRepo.createMany.mockResolvedValue({ count: 2 });

    const out = await leadService.importLeads(
      {
        rows: [
          { name: "A", email: "taken@x.com" }, // existing email → skipped
          { name: "B", email: "new@x.com" }, // kept
          { name: "B2", email: "NEW@x.com" }, // intra-batch dup (case-insensitive) → skipped
          { name: "Existing Nameless" }, // existing name → skipped
          { name: "Fresh Nameless", clientName: "acme health" }, // kept, client resolved
        ],
      },
      h.user as AuthUser,
    );

    expect(out).toEqual({ added: 2, skipped: 3 });
    const rows = h.leadRepo.createMany.mock.calls[0]![0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "B",
      email: "new@x.com",
      status: "Sourced",
      createdById: "u1",
    });
    expect(rows[1]).toMatchObject({ name: "Fresh Nameless", clientId: "cl1" }); // case-insensitive client match
    expect(h.writeAudit.mock.calls[0]![1]).toMatchObject({
      action: "bulk_import",
      after: { added: 2, skipped: 3 },
    });
  });
});
