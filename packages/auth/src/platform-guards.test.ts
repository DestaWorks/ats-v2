import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function codeOnly(path: string): string {
  return readFileSync(join(__dirname, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SOURCE = codeOnly("platform-guards.ts");
const API_GUARD = readFileSync(
  join(__dirname, "../../../apps/api/src/common/guards/platform-auth.guard.ts"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/**
 * Which INSTANCE authenticates the platform plane.
 *
 * Reading the operator instance here is not a type error and breaks no other test: the console
 * simply 401s on every call and renders an error that looks like a session bug. That is exactly
 * what happened once the two planes were given separate cookie names, so the choice is pinned.
 */
describe("platform plane authentication", () => {
  it("reads the console's own auth instance", () => {
    expect(SOURCE).toMatch(/platformAuth\.api\.getSession/);
  });

  it("never reads the operator instance — its cookie must not reach /platform/*", () => {
    expect(SOURCE).not.toMatch(/from "\.\/auth"/);
    expect(SOURCE).not.toMatch(/\bauth\.api\.getSession/);
  });

  it("refuses an absent session rather than resolving a tenant for it", () => {
    expect(SOURCE).toMatch(/UNAUTHORIZED/);
    expect(SOURCE).not.toMatch(/TenantContext|resolveTenantContext/);
  });

  it("is what the API's platform guard uses", () => {
    expect(API_GUARD).toMatch(/requirePlatformIdentity/);
    expect(API_GUARD).not.toMatch(/requireSignedInIdentity/);
  });
});
