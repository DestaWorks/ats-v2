import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { fixedClock } from "@destaworks/domain/clock";
import { isConsentLive, requireImpersonatedReadScope, type SupportConsent } from "./impersonation";
import type { AuthUser } from "./guards";

/**
 * The impersonation gate (Phase 8). Everything here is a REFUSAL case, because the property worth
 * proving is that all three conditions are load-bearing: drop the allowlist, drop the consent, or
 * let the clock run past the window, and the crossing stops.
 */

const ORIGINAL = process.env["PLATFORM_ADMIN_USER_IDS"];

const NOW = new Date("2026-08-29T12:00:00.000Z");
const clock = fixedClock(NOW);

const admin: AuthUser = { id: "u-platform", email: "ops@destaworks.com", name: "Ops" };
/** The most privileged identity a TENANT can produce. It must get nothing here. */
const owner: AuthUser = { id: "u-owner", email: "owner@acme.example", name: "Acme Owner" };

function consentUntil(minutesFromNow: number, withdrawn = false): SupportConsent {
  return {
    grantedAt: NOW,
    expiresAt: new Date(NOW.getTime() + minutesFromNow * 60_000),
    withdrawn,
  };
}

beforeEach(() => {
  process.env["PLATFORM_ADMIN_USER_IDS"] = "u-platform";
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["PLATFORM_ADMIN_USER_IDS"];
  else process.env["PLATFORM_ADMIN_USER_IDS"] = ORIGINAL;
});

describe("isConsentLive", () => {
  it("is false when the tenant never consented", () => {
    expect(isConsentLive(null, NOW)).toBe(false);
  });

  it("is false once withdrawn, even while the window would still have been open", () => {
    expect(isConsentLive(consentUntil(30, true), NOW)).toBe(false);
  });

  it("is false at the exact instant of expiry — the boundary closes the window", () => {
    const consent = consentUntil(30);
    expect(isConsentLive(consent, consent.expiresAt)).toBe(false);
  });

  it("is true inside an open window", () => {
    expect(isConsentLive(consentUntil(30), NOW)).toBe(true);
  });
});

describe("requireImpersonatedReadScope", () => {
  it("grants a read-only scope to a platform admin inside an open window", () => {
    const scope = requireImpersonatedReadScope(admin, "t1", consentUntil(30), clock);

    expect(scope.kind).toBe("impersonated-read");
    expect(scope.tenantId).toBe("t1");
    expect(scope.platformUserId).toBe("u-platform");
  });

  it("carries no role, membership or capability — it cannot be used as a context", () => {
    const scope: Record<string, unknown> = {
      ...requireImpersonatedReadScope(admin, "t1", consentUntil(30), clock),
    };

    expect(scope["role"]).toBeUndefined();
    expect(scope["membershipId"]).toBeUndefined();
    expect(scope["capabilities"]).toBeUndefined();
  });

  it("refuses a tenant Owner even when the window is wide open", () => {
    expect(() => requireImpersonatedReadScope(owner, "t1", consentUntil(60), clock)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("refuses a platform admin when the tenant never consented", () => {
    expect(() => requireImpersonatedReadScope(admin, "t1", null, clock)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("refuses a platform admin after consent is withdrawn", () => {
    expect(() => requireImpersonatedReadScope(admin, "t1", consentUntil(30, true), clock)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("refuses once the window has run out, with no client involvement", () => {
    const consent = consentUntil(30);
    const later = fixedClock(new Date(consent.expiresAt.getTime() + 1));

    expect(() => requireImpersonatedReadScope(admin, "t1", consent, later)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("stops being usable as time passes, on the same consent record", () => {
    const consent = consentUntil(10);

    expect(() => requireImpersonatedReadScope(admin, "t1", consent, fixedClock(NOW))).not.toThrow();
    expect(() =>
      requireImpersonatedReadScope(
        admin,
        "t1",
        consent,
        fixedClock(new Date(NOW.getTime() + 11 * 60_000)),
      ),
    ).toThrow(expect.objectContaining({ code: "FORBIDDEN" }));
  });

  it("refuses everyone when the platform plane is unconfigured", () => {
    delete process.env["PLATFORM_ADMIN_USER_IDS"];

    expect(() => requireImpersonatedReadScope(admin, "t1", consentUntil(30), clock)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });

  it("gives the same refusal whoever is denied — no probing which condition failed", () => {
    const messages: string[] = [];
    for (const attempt of [
      () => requireImpersonatedReadScope(owner, "t1", consentUntil(30), clock),
      () => requireImpersonatedReadScope(admin, "t1", null, clock),
      () => requireImpersonatedReadScope(admin, "t1", consentUntil(30, true), clock),
    ]) {
      try {
        attempt();
      } catch (error) {
        messages.push((error as Error).message);
      }
    }

    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(1);
  });
});
