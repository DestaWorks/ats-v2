import { describe, it, expect } from "vitest";
import { assertDisposableDatabase, checkDatabaseUrl } from "./guard-database";

describe("checkDatabaseUrl", () => {
  it("allows a local database", () => {
    for (const host of ["localhost", "127.0.0.1", "host.docker.internal"]) {
      const result = checkDatabaseUrl(`postgresql://user:pass@${host}:5432/desta_e2e`);
      expect(result.ok).toBe(true);
      expect(result.database).toBe("desta_e2e");
    }
  });

  it("refuses a hosted database", () => {
    const result = checkDatabaseUrl(
      "postgresql://user:pass@aws-0-eu-central-1.pooler.supabase.com:5432/postgres",
    );
    expect(result.ok).toBe(false);
    expect(result.host).toBe("aws-0-eu-central-1.pooler.supabase.com");
  });

  it("refuses any other remote host, not just a known provider", () => {
    expect(checkDatabaseUrl("postgresql://u:p@db.internal.company:5432/app").ok).toBe(false);
    expect(checkDatabaseUrl("postgresql://u:p@10.0.0.5:5432/app").ok).toBe(false);
  });

  it("fails closed on a missing or unusable value", () => {
    expect(checkDatabaseUrl(undefined).ok).toBe(false);
    expect(checkDatabaseUrl("").ok).toBe(false);
    expect(checkDatabaseUrl("   ").ok).toBe(false);
    expect(checkDatabaseUrl("not-a-url").ok).toBe(false);
  });

  it("is not fooled by a remote host that merely contains a local name", () => {
    expect(checkDatabaseUrl("postgresql://u:p@localhost.evil.com:5432/app").ok).toBe(false);
    expect(checkDatabaseUrl("postgresql://u:p@notlocalhost:5432/app").ok).toBe(false);
  });
});

describe("assertDisposableDatabase", () => {
  it("passes for a local database", () => {
    expect(() =>
      assertDisposableDatabase({ DATABASE_URL: "postgresql://u:p@127.0.0.1:5432/desta_e2e" }),
    ).not.toThrow();
  });

  it("throws, and names the host, for a remote one", () => {
    expect(() =>
      assertDisposableDatabase({ DATABASE_URL: "postgresql://u:p@13.140.40.247:5432/destaworks" }),
    ).toThrow(/13\.140\.40\.247/);
  });

  it("never prints the credentials it was given", () => {
    try {
      assertDisposableDatabase({
        DATABASE_URL: "postgresql://admin:SUPERSECRET@13.140.40.247:5432/destaworks",
      });
      throw new Error("expected the guard to refuse");
    } catch (error) {
      expect(String(error)).not.toContain("SUPERSECRET");
      expect(String(error)).not.toContain("admin:");
    }
  });
});
