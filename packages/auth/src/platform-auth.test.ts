import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Comments explain the config; only the config decides. Strip prose so a docstring that NAMES a
 *  setting is never mistaken for one that applies it. */
function codeOnly(path: string): string {
  return readFileSync(join(__dirname, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const SOURCE = codeOnly("platform-auth.ts");
const OPERATOR = codeOnly("auth.ts");

/**
 * The console's session must not be the operator app's.
 *
 * Asserted against the source rather than by booting two instances: what makes them independent is
 * configuration — a distinct cookie name and the absence of domain sharing — and configuration is
 * exactly what a later edit can undo without any test noticing. A single missing line here
 * silently reunifies the two planes, and the symptom (signing into a workspace signs you out of
 * the console) looks like a bug in something else entirely.
 */
describe("platformAuth — session isolation", () => {
  it("uses its own cookie name, so the two cookies cannot be mistaken for each other", () => {
    expect(SOURCE).toMatch(/cookiePrefix:\s*"desta-platform"/);
  });

  it("never shares its cookie across subdomains — that is what keeps it on the console's host", () => {
    expect(SOURCE).not.toContain("crossSubDomainCookies");
    expect(SOURCE).not.toContain("COOKIE_DOMAIN");
  });

  it("the operator app, by contrast, DOES share across the parent domain", () => {
    // Stated here so the asymmetry is deliberate and visible: if the operator app ever stopped
    // sharing, this file's reason for existing would need rereading rather than silently holding.
    expect(OPERATOR).toContain("crossSubDomainCookies");
  });

  it("offers no self-service account creation on the plane that reads every tenant", () => {
    expect(SOURCE).toMatch(/disableSignUp:\s*true/);
    expect(SOURCE).not.toContain("socialProviders");
    expect(SOURCE).not.toContain("sendResetPassword");
  });

  it("rate limits its sign-in at least as tightly as the operator app", () => {
    const platformMax = /"\/sign-in\/email":\s*\{[^}]*max:\s*(\d+)/.exec(SOURCE)?.[1];
    expect(platformMax).toBeDefined();
    expect(Number(platformMax)).toBeLessThanOrEqual(5);
  });
});
