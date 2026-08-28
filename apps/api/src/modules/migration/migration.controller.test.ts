import "reflect-metadata";
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

/**
 * Contract parity for `POST /api/migration/{prepare,commit}`: the `bulkImport` denials, the 422
 * envelope from the shared `importInputSchema`, and the per-user rate limit the commit carries.
 */

vi.mock("server-only", () => ({}));

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  prepare: vi.fn(),
  commit: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/integrations/http/rate-limit", () => ({ checkRateLimit: h.checkRateLimit }));

import { installNestRequestContext } from "../../common/request-context/nest-request-context";
import { provideFakeService, startTestApi, type TestApi } from "../../common/testing/nest-app";
import { MigrationController } from "./migration.controller";
import { MIGRATION_SERVICE } from "./migration.tokens";

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
    providers: [provideFakeService(MIGRATION_SERVICE, { prepare: h.prepare, commit: h.commit })],
  });
});

afterAll(() => api.close());

beforeEach(() => {
  h.session = null;
  h.prepare.mockReset();
  h.commit.mockReset();
  h.checkRateLimit.mockReset();
});

describe.each([
  { path: "/migration/prepare", call: h.prepare },
  { path: "/migration/commit", call: h.commit },
])("POST $path", ({ path, call }) => {
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

  it("200 for Owner, handing the service the parsed body and the session user", async () => {
    h.session = OWNER;
    call.mockResolvedValue({ created: 1 });
    const res = await post(path, BODY);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ created: 1 });
    expect(call).toHaveBeenCalledWith(
      expect.objectContaining({ format: "csv" }),
      expect.objectContaining({ id: "u1" }),
    );
  });
});

describe("rate limiting", () => {
  it("meters the commit per user, matching the route's 10/min bucket", async () => {
    h.session = OWNER;
    h.commit.mockResolvedValue({});
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
