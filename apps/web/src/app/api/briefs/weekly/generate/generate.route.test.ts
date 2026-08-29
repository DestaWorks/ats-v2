import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearBriefGenerationEnqueuer,
  registerBriefGenerationEnqueuer,
} from "@destaworks/application/brief-generation.port";

/**
 * POST /api/briefs/weekly/generate — guarded: unauth → 401, non-leadership → 403 (`viewReports`).
 * Phase 5: it enqueues rather than generating; see the daily route's test for why the queue is
 * bound through the registry instead of module-mocked.
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

const enqueued: { name: string; payload: unknown }[] = [];

const fakeEnqueuer = {
  weekly: (input: unknown) => {
    enqueued.push({ name: "briefs.weekly.generate", payload: input });
    return Promise.resolve({ jobId: "job-1", job: "briefs.weekly.generate" });
  },
};

function req() {
  return new Request("http://localhost/api/briefs/weekly/generate", {
    method: "POST",
    body: JSON.stringify({ weekStart: "2026-07-23", tz: -180 }),
  });
}

beforeEach(() => {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "U", role: "Owner" } };
  enqueued.length = 0;
  registerBriefGenerationEnqueuer(fakeEnqueuer as never);
});

afterEach(() => {
  clearBriefGenerationEnqueuer();
});

describe("POST /api/briefs/weekly/generate", () => {
  it("401 when signed out (nothing queued)", async () => {
    h.session = null;
    const res = await POST(req(), undefined);
    expect(res.status).toBe(401);
    expect(enqueued).toHaveLength(0);
  });

  it("403 for a non-leadership role (nothing queued)", async () => {
    h.session = { user: { id: "u1", email: "a@desta.works", name: "A", role: "Associate" } };
    const res = await POST(req(), undefined);
    expect(res.status).toBe(403);
    expect(enqueued).toHaveLength(0);
  });

  it("202 with the job id, delegating the validated payload to the enqueue port", async () => {
    const res = await POST(req(), undefined);

    expect(res.status).toBe(202);
    expect(await res.json()).toEqual({ jobId: "job-1", job: "briefs.weekly.generate" });
    // The Monday-normalised singleton key is asserted in `packages/jobs/src/enqueue/briefs.test.ts`,
    // where it is defined. `apps/web` may not import `@destaworks/jobs`, so this route owes only
    // that the parsed payload reaches the port intact.
    expect(enqueued).toEqual([
      { name: "briefs.weekly.generate", payload: { weekStart: "2026-07-23", tz: -180 } },
    ]);
  });
});
