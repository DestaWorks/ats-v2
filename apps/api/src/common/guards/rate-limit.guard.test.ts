import "reflect-metadata";
import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * `RateLimitGuard` — transport around the shared limiter. The limiter's own thresholds, its
 * in-memory fallback and its deliberate fail-open on an Upstash outage are covered by
 * `packages/integrations/src/http/rate-limit.test.ts`; this file asserts the part the guard owns:
 * that a declared rule is applied at all, and that the bucket key separates callers the way the
 * Next.js routes already do (`name:userId` per user, bare `name` when anonymous).
 *
 * It runs the REAL limiter — no Upstash env in test, so the in-memory path — because two callers
 * provably not sharing a bucket is better evidence of correct keying than a spied-on key string.
 */

vi.mock("server-only", () => ({}));

import { __resetRateLimit } from "@destaworks/integrations/http/rate-limit";
import { RateLimit } from "../decorators/rate-limit.decorator";
import { executionContextFor } from "./testing/execution-context.fixture";
import { RateLimitGuard } from "./rate-limit.guard";
import type { AuthenticatedRequest, PortalRequest } from "./authenticated-request";

const guard = new RateLimitGuard();

/** A handler carrying the metadata the real decorator writes — applied by calling it directly. */
function handlerLimitedTo(name: string, limit: number): () => void {
  const handler = function limitedHandler(): void {};
  RateLimit({ name, limit, windowMs: 60_000 })(handler);
  return handler;
}

function userRequest(id: string): AuthenticatedRequest {
  return {
    headers: {},
    user: {
      tenantId: "t1",
      membershipId: `${id}-m`,
      user: { id, email: `${id}@desta.works`, name: "Test User" },
      role: "Associate",
    },
  };
}

beforeEach(() => {
  __resetRateLimit();
});

describe("RateLimitGuard — applying a rule", () => {
  it("allows up to the limit, then refuses with the RATE_LIMITED envelope", async () => {
    const handler = handlerLimitedTo("guard-threshold", 2);
    const context = executionContextFor({ request: userRequest("u1"), handler });

    expect(await guard.canActivate(context)).toBe(true);
    expect(await guard.canActivate(context)).toBe(true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
    });
  });

  it("does not limit a handler that declared no rule", async () => {
    const context = executionContextFor({ request: userRequest("u1") });
    for (let i = 0; i < 50; i += 1) {
      expect(await guard.canActivate(context)).toBe(true);
    }
  });

  it("reads a rule declared on the controller", async () => {
    const controller = class ResumeController {};
    RateLimit({ name: "guard-controller", limit: 1, windowMs: 60_000 })(controller);
    const context = executionContextFor({ request: userRequest("u1"), controller });

    expect(await guard.canActivate(context)).toBe(true);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("RateLimitGuard — bucket keying", () => {
  it("gives each authenticated user their own bucket", async () => {
    const handler = handlerLimitedTo("guard-per-user", 1);

    const first = executionContextFor({ request: userRequest("alice"), handler });
    expect(await guard.canActivate(first)).toBe(true);
    await expect(guard.canActivate(first)).rejects.toMatchObject({ code: "RATE_LIMITED" });

    // Alice is exhausted; Bob must be untouched by it.
    const second = executionContextFor({ request: userRequest("bob"), handler });
    expect(await guard.canActivate(second)).toBe(true);
  });

  it("keys a portal caller by their contact, not by the client they belong to", async () => {
    const handler = handlerLimitedTo("guard-portal", 1);
    const portalRequest = (contactId: string): PortalRequest => ({
      headers: {},
      portal: { contactId, clientId: "client_1", tenantId: "t1", fullName: "Dana", email: null },
    });

    const dana = executionContextFor({ request: portalRequest("contact_1"), handler });
    expect(await guard.canActivate(dana)).toBe(true);
    await expect(guard.canActivate(dana)).rejects.toMatchObject({ code: "RATE_LIMITED" });

    const sam = executionContextFor({ request: portalRequest("contact_2"), handler });
    expect(await guard.canActivate(sam)).toBe(true);
  });

  it("shares one bucket across anonymous callers, as the portal-access route does today", async () => {
    const handler = handlerLimitedTo("guard-anonymous", 1);

    const first = executionContextFor({ request: { headers: {} }, handler });
    expect(await guard.canActivate(first)).toBe(true);

    // A different anonymous request, same bare bucket — there is no identity to separate them by.
    const second = executionContextFor({ request: { headers: {} }, handler });
    await expect(guard.canActivate(second)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});
