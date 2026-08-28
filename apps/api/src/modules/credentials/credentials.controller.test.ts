import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `CredentialsController` (SAAS-RESTRUCTURE-PLAN 4.3).
 *
 * One endpoint, and everything worth pinning about it is the gate: an aggregate over every
 * candidate's licensure is a leadership read, so an authenticated caller without `viewCredentials`
 * must be refused BEFORE the aggregate is computed — the denial and the fact that nothing is read
 * are asserted together, because a 403 returned after the query still moved the data.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  credentials: { overview: vi.fn() },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/credentials-intelligence.service", () => ({
  credentialsIntelligenceService: h.credentials,
}));
vi.mock("@destaworks/application/license-verify.service", () => ({ licenseVerifyService: {} }));

import {
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { CredentialsModule } from "./credentials.module";

const OVERVIEW = { expiring: [], unverified: [], byState: [], totals: { verified: 0, total: 0 } };

let api: ContractHost;

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeAll(async () => {
  api = await startContractHost(CredentialsModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  h.credentials.overview.mockResolvedValue(OVERVIEW);
});

describe("GET /credentials/overview", () => {
  it("refuses an authenticated viewer without viewCredentials with 403, computing nothing", async () => {
    signInAs("Associate");
    const res = await api.request("/credentials/overview");
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("FORBIDDEN");
    expect(h.credentials.overview).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401", async () => {
    h.session = null;
    const res = await api.request("/credentials/overview");
    expect(res.status).toBe(401);
    expect(h.credentials.overview).not.toHaveBeenCalled();
  });

  it("answers 200 with the snapshot for a viewer who holds the capability", async () => {
    signInAs("Owner");
    const res = await api.request("/credentials/overview");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OVERVIEW);
  });
});
