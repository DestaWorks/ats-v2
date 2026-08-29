import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearBriefGenerationEnqueuer,
  registerBriefGenerationEnqueuer,
} from "@destaworks/application/brief-generation.port";

/**
 * POST /api/briefs/daily/generate — guarded: unauth → 401, non-leadership → 403 (`viewReports`);
 * neither consumes the rate limit or reaches the queue.
 *
 * Phase 5: this endpoint enqueues instead of generating, so the fake here is the enqueue PORT
 * rather than the brief service. It is registered rather than module-mocked, so the route's own
 * resolution path runs. The singleton key is not asserted here — `apps/web` may not import
 * `@destaworks/jobs`, and the key is tested where it is defined, in `enqueue/briefs.test.ts`.
 */
const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/config/request-context", () => ({
  requestContext: () => ({ headers: async () => new Headers(), cookie: async () => undefined }),
}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));

import { POST } from "./route";

const enqueued: { name: string; payload: unknown; tenantId: string }[] = [];

const fakeEnqueuer = {
  daily: (input: unknown, tenantId: string) => {
    enqueued.push({ name: "briefs.daily.generate", payload: input, tenantId });
    return Promise.resolve({ jobId: "job-1", job: "briefs.daily.generate" });
  },
};

function req(body: unknown) {
  return new Request("http://localhost/api/briefs/daily/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const body = { date: "2026-07-23", tz: -180, priorityClientId: null };

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  enqueued.length = 0;
  registerBriefGenerationEnqueuer(fakeEnqueuer as never);
});

afterEach(() => {
  clearBriefGenerationEnqueuer();
});

describe("POST /api/briefs/daily/generate", () => {
  it("401 when signed out (nothing queued)", async () => {
    h.session = null;
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(401);
    expect(enqueued).toHaveLength(0);
  });

  it("403 for a non-leadership role (nothing queued)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(body), undefined);
    expect(res.status).toBe(403);
    expect(enqueued).toHaveLength(0);
  });

  it("202 with the job id, delegating the validated payload to the enqueue port", async () => {
    const res = await POST(req(body), undefined);

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-1", job: "briefs.daily.generate" });
    // The singleton key is asserted in `packages/jobs/src/enqueue/briefs.test.ts`, where it is
    // defined. `apps/web` may not import `@destaworks/jobs`, so what this route owes is narrower:
    // the parsed payload reaches the port intact, under the tenant the guard resolved.
    expect(enqueued).toEqual([
      {
        name: "briefs.daily.generate",
        payload: { date: "2026-07-23", tz: -180, priorityClientId: null },
        tenantId: "t1",
      },
    ]);
  });

  it("takes the tenant from the guard, not from the body", async () => {
    const res = await POST(req({ ...body, tenantId: "someone-elses-tenant" }), undefined);

    expect(res.status).toBe(202);
    expect(enqueued[0]?.tenantId).toBe("t1");
    // The request schema strips it, so it never even reaches the port as part of the input.
    expect(enqueued[0]?.payload).not.toHaveProperty("tenantId");
  });
});
