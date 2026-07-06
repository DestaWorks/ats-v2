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
    logOutreach: vi.fn(),
    listOutreach: vi.fn(),
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
  it("forwards filters, derives hasMore/nextCursor from PAGE+1, resolves targetClientName", async () => {
    // 51 rows → hasMore true, page trimmed to 50, cursor from the 50th.
    const rows = Array.from({ length: 51 }, (_, i) =>
      lead({ id: `l${i}`, createdAt: new Date(2026, 0, 1, 0, 0, i) }),
    );
    h.leadRepo.list.mockResolvedValue(rows);
    h.leadRepo.count.mockResolvedValue(120);

    const out = await leadService.list({ status: "Sourced", source: "LinkedIn", search: "jane" });

    const [listFilters] = h.leadRepo.list.mock.calls[0]!;
    expect(listFilters).toMatchObject({
      status: "Sourced",
      source: "LinkedIn",
      search: "jane",
      take: 51,
    });
    const [countFilters] = h.leadRepo.count.mock.calls[0]!;
    expect(countFilters).toMatchObject({ status: "Sourced", source: "LinkedIn", search: "jane" });

    expect(out.leads).toHaveLength(50);
    expect(out.count).toBe(50);
    expect(out.hasMore).toBe(true);
    expect(out.nextCursor).toBeTypeOf("string");
    expect(out.total).toBe(120);
    expect(out.leads[0]!.targetClientName).toBe("Acme Health");
  });

  it("no next page when the result fits in one page", async () => {
    h.leadRepo.list.mockResolvedValue([lead()]);
    h.leadRepo.count.mockResolvedValue(1);
    const out = await leadService.list({});
    expect(out.hasMore).toBe(false);
    expect(out.nextCursor).toBeNull();
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
