import { describe, it, expect } from "vitest";
import { readTenantClaim } from "./tenant-claim";

/**
 * The claim reader is pure, so this is the cheapest place to pin the precedence rule that the rest
 * of the phase depends on: path > subdomain > cookie, with the cookie always losing to anything the
 * user can see in their URL bar.
 *
 * None of these cases grants anything — a claim is unverified by construction. What is being
 * asserted is that the request is read the SAME way every time, so `resolveTenantContext` is asked
 * about the tenant the user actually named.
 */
describe("readTenantClaim — precedence", () => {
  it("prefers the path segment over both the subdomain and the cookie", () => {
    expect(
      readTenantClaim({
        host: "beta.desta.works",
        path: "/t/acme/pipeline?q=jane",
        cookie: "northwind",
      }),
    ).toEqual({ source: "path", slug: "acme" });
  });

  it("prefers the subdomain over the cookie", () => {
    expect(
      readTenantClaim({ host: "acme.desta.works", path: "/pipeline", cookie: "northwind" }),
    ).toEqual({ source: "subdomain", slug: "acme" });
  });

  it("falls back to the cookie when the URL names no tenant", () => {
    expect(readTenantClaim({ host: "app.desta.works", path: "/pipeline", cookie: "acme" })).toEqual(
      {
        source: "cookie",
        slug: "acme",
      },
    );
  });

  it("returns null when the request names no tenant at all", () => {
    expect(readTenantClaim({ host: "app.desta.works", path: "/pipeline" })).toBeNull();
  });

  it("never reports a `body` source — that one is only ever constructed by an explicit switch", () => {
    const claim = readTenantClaim({ host: "acme.desta.works", path: "/t/acme", cookie: "acme" });
    expect(claim?.source).not.toBe("body");
  });
});

describe("readTenantClaim — what is not a claim", () => {
  it("ignores reserved host labels so infrastructure cannot be read as a tenant", () => {
    for (const host of ["www.desta.works", "api.desta.works", "admin.desta.works"]) {
      expect(readTenantClaim({ host, path: "/pipeline" })).toBeNull();
    }
  });

  it("ignores a reserved slug in the path and in the cookie too, not just the host", () => {
    expect(readTenantClaim({ path: "/t/admin/pipeline" })).toBeNull();
    expect(readTenantClaim({ cookie: "api" })).toBeNull();
  });

  it("ignores an apex host, which has no subdomain to read", () => {
    expect(readTenantClaim({ host: "desta.works", path: "/pipeline" })).toBeNull();
  });

  it("does not read `127` out of a loopback address", () => {
    expect(readTenantClaim({ host: "127.0.0.1:3003", path: "/pipeline" })).toBeNull();
  });

  it("rejects a syntactically invalid slug instead of passing it to the database", () => {
    expect(readTenantClaim({ path: "/t/-acme/pipeline" })).toBeNull();
    expect(readTenantClaim({ cookie: "acme.co" })).toBeNull();
    expect(readTenantClaim({ cookie: "a b" })).toBeNull();
  });

  it("does not treat an ordinary first path segment as a tenant", () => {
    expect(readTenantClaim({ path: "/pipeline/123" })).toBeNull();
  });
});

describe("readTenantClaim — normalisation", () => {
  it("lowercases and trims, so one tenant is not two", () => {
    expect(readTenantClaim({ cookie: "  ACME " })).toEqual({ source: "cookie", slug: "acme" });
    expect(readTenantClaim({ host: "ACME.Desta.Works" })).toEqual({
      source: "subdomain",
      slug: "acme",
    });
  });

  it("strips the port before reading the host", () => {
    expect(readTenantClaim({ host: "acme.desta.works:8443" })).toEqual({
      source: "subdomain",
      slug: "acme",
    });
  });

  it("treats `localhost` as an apex so `acme.localhost` works in development", () => {
    expect(readTenantClaim({ host: "acme.localhost:3003" })).toEqual({
      source: "subdomain",
      slug: "acme",
    });
    expect(readTenantClaim({ host: "localhost:3003" })).toBeNull();
  });
});
