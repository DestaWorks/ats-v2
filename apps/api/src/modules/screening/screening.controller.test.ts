import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `ScreeningController` (SAAS-RESTRUCTURE-PLAN 4.3).
 *
 * Two endpoints, and the ordering between them is the thing a port silently breaks: `candidates` is
 * a literal segment sharing a prefix with `:candidateId`, so a controller that declared them the
 * other way round would route `GET /screening/candidates` into the save handler. It is asserted, not
 * assumed.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  screening: { listEligibleCandidates: vi.fn(), saveAndMaybeMove: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/screening.service", () => ({ screeningService: h.screening }));

import {
  jsonBody,
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { ScreeningModule } from "./screening.module";

let api: ContractHost;

beforeAll(async () => {
  api = await startContractHost(ScreeningModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role: "Associate" } };
  h.screening.listEligibleCandidates.mockResolvedValue([]);
  h.screening.saveAndMaybeMove.mockResolvedValue({ id: "s1", candidateId: "c1" });
});

describe("GET /screening/candidates", () => {
  it("answers the picker list and is matched before the `:candidateId` route", async () => {
    h.screening.listEligibleCandidates.mockResolvedValue([{ id: "c1", name: "Jane Doe" }]);
    const res = await api.request("/screening/candidates");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: [{ id: "c1", name: "Jane Doe" }] });
    expect(h.screening.saveAndMaybeMove).not.toHaveBeenCalled();
  });

  it("forwards a trimmed search term", async () => {
    await api.request("/screening/candidates?search=%20%20jane%20%20");
    expect(h.screening.listEligibleCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.any(String) }),
      "jane",
    );
  });

  it("treats a blank search as no filter, not as a search for the empty string", async () => {
    await api.request("/screening/candidates?search=%20");
    expect(h.screening.listEligibleCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: expect.any(String) }),
      undefined,
    );
  });

  it("refuses a signed-out caller with 401 and reads nothing", async () => {
    h.session = null;
    const res = await api.request("/screening/candidates");
    expect(res.status).toBe(401);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("UNAUTHORIZED");
    expect(h.screening.listEligibleCandidates).not.toHaveBeenCalled();
  });
});

describe("POST /screening/:candidateId", () => {
  it("answers 200 with the persisted scorecard, not Nest's default 201", async () => {
    const res = await api.request("/screening/c1", jsonBody({ action: "save" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scorecard: { id: "s1", candidateId: "c1" } });
    expect(h.screening.saveAndMaybeMove.mock.calls[0]?.[0]).toBe("c1");
    expect(h.screening.saveAndMaybeMove.mock.calls[0]?.[2]).toMatchObject({ user: { id: "u1" } });
  });

  it("rejects an unknown action with 422 and saves nothing", async () => {
    const res = await api.request("/screening/c1", jsonBody({ action: "reject" }));
    expect(res.status).toBe(422);
    expect(h.screening.saveAndMaybeMove).not.toHaveBeenCalled();
  });

  it("surfaces a blocked stage gate as 422 — the scorecard is the service's to have saved", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.screening.saveAndMaybeMove.mockRejectedValue(
      new AppError("STAGE_BLOCKED", "License not verified"),
    );
    const res = await api.request("/screening/c1", jsonBody({ action: "advance" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("STAGE_BLOCKED");
  });

  it("refuses a signed-out caller with 401 and saves nothing", async () => {
    h.session = null;
    const res = await api.request("/screening/c1", jsonBody({ action: "save" }));
    expect(res.status).toBe(401);
    expect(h.screening.saveAndMaybeMove).not.toHaveBeenCalled();
  });
});
