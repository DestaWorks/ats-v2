import "reflect-metadata";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * Contract parity for the migration endpoints: the `bulkImport` denials, the 422 envelope from the
 * shared `importInputSchema`, and the per-user rate limit the commit carries. Phase 5 changed what
 * the commit answers with — a queued run, 202 — so the parity assertion moved with it.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  prepare: vi.fn(),
  commit: vi.fn(),
  start: vi.fn(),
  state: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/integrations/http/rate-limit", () => ({ checkRateLimit: h.checkRateLimit }));

import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { provideFakeService, startTestApi, type TestApi } from "../../common/testing/nest-app";
import { MigrationController } from "./migration.controller";
import { MIGRATION_RUN_SERVICE, MIGRATION_SERVICE } from "./migration.tokens";

interface Envelope {
  error: { code: string; message: string; issues?: { path: string; message: string }[] };
}

const OWNER = { user: { id: "u1", email: "o@desta.works", name: "O", role: "Owner" } };
const ASSOCIATE = { user: { id: "u2", email: "a@desta.works", name: "A", role: "Associate" } };
const BODY = { format: "csv", content: "name,email\nJane,jane@example.com\n" };

let api: TestApi;

const post = (path: string, body: unknown) =>
  api.fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  installNestRequestContext();
  api = await startTestApi({
    controllers: [MigrationController],
    providers: [
      provideFakeService(MIGRATION_SERVICE, { prepare: h.prepare, commit: h.commit }),
      provideFakeService(MIGRATION_RUN_SERVICE, { start: h.start, state: h.state }),
    ],
  });
});

afterAll(() => api.close());

beforeEach(() => {
  h.session = null;
  h.prepare.mockReset();
  h.commit.mockReset();
  h.start.mockReset();
  h.state.mockReset();
  h.checkRateLimit.mockReset();
});

describe.each([
  { path: "/migration/prepare", call: h.prepare, ok: 200 },
  { path: "/migration/commit", call: h.start, ok: 202 },
])("POST $path", ({ path, call, ok }) => {
  it("401 when signed out", async () => {
    const res = await post(path, BODY);
    expect(res.status).toBe(401);
    expect(((await res.json()) as Envelope).error.code).toBe("UNAUTHORIZED");
    expect(call).not.toHaveBeenCalled();
  });

  it("403 for a role without bulkImport", async () => {
    h.session = ASSOCIATE;
    const res = await post(path, BODY);
    expect(res.status).toBe(403);
    expect(((await res.json()) as Envelope).error.code).toBe("FORBIDDEN");
    expect(call).not.toHaveBeenCalled();
  });

  it("422 with field issues when the body fails the contract schema", async () => {
    h.session = OWNER;
    const res = await post(path, { format: "xml", content: "" });
    expect(res.status).toBe(422);
    const body = (await res.json()) as Envelope;
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.error.issues?.map((i) => i.path)).toContain("format");
    expect(call).not.toHaveBeenCalled();
  });

  it("succeeds for Owner, handing the service the parsed body and the session user", async () => {
    h.session = OWNER;
    call.mockResolvedValue({ created: 1 });
    const res = await post(path, BODY);
    expect(res.status).toBe(ok);
    expect(await res.json()).toEqual({ created: 1 });
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      expect.objectContaining({ format: "csv" }),
    );
  });
});

describe("GET /migration/runs/:runId", () => {
  const get = (path: string) => api.fetch(path, { method: "GET" });

  it("401 when signed out", async () => {
    const res = await get("/migration/runs/run-1");
    expect(res.status).toBe(401);
    expect(h.state).not.toHaveBeenCalled();
  });

  it("403 for a role without bulkImport — reading a run is not a lesser privilege", async () => {
    h.session = ASSOCIATE;
    const res = await get("/migration/runs/run-1");
    expect(res.status).toBe(403);
    expect(h.state).not.toHaveBeenCalled();
  });

  it("200 with the run state for Owner", async () => {
    h.session = OWNER;
    h.state.mockResolvedValue({ runId: "run-1", status: "running", processedRows: 12 });
    const res = await get("/migration/runs/run-1");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "running", processedRows: 12 });
    expect(h.state).toHaveBeenCalledWith(
      expect.objectContaining({ user: expect.objectContaining({ id: "u1" }) }),
      "run-1",
    );
  });
});

describe("rate limiting", () => {
  it("meters the commit per user, matching the route's 10/min bucket", async () => {
    h.session = OWNER;
    h.start.mockResolvedValue({});
    await post("/migration/commit", BODY);
    expect(h.checkRateLimit).toHaveBeenCalledWith("migration-commit:u1", {
      limit: 10,
      windowMs: 60_000,
    });
  });

  it("leaves the dry-run prepare unmetered, as the route does", async () => {
    h.session = OWNER;
    h.prepare.mockResolvedValue({});
    await post("/migration/prepare", BODY);
    expect(h.checkRateLimit).not.toHaveBeenCalled();
  });
});
