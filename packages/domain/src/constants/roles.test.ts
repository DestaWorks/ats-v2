import { describe, it, expect } from "vitest";
import {
  CAPABILITIES,
  ROLES,
  isRole,
  hasCapability,
  isLeadership,
  templateGrants,
  toCapabilities,
  ROLE_CAPABILITIES,
  type Role,
} from "./roles";

/** A viewer holding exactly what a built-in template grants — what a freshly seeded tenant has. */
const asTemplate = (role: Role) => ({ capabilities: ROLE_CAPABILITIES[role] });

describe("roles & capabilities", () => {
  it("has exactly the six built-in templates", () => {
    expect(ROLES).toEqual(["Owner", "Director", "Manager", "Screener", "Associate", "Admin"]);
  });

  it("guards role strings", () => {
    expect(isRole("Owner")).toBe(true);
    expect(isRole("admin")).toBe(false); // exact-cased; "Admin" is the value
    expect(isRole("Superuser")).toBe(false);
  });

  /**
   * The change that made roles sellable: a decision reads the VIEWER'S capabilities, not a name.
   * Two workspaces may both have a "Director" that grants different things, so a name cannot
   * answer the question any more — and this proves the primitive no longer tries to.
   */
  it("decides from the viewer's own capabilities, not from a role name", () => {
    const narrowDirector = { capabilities: ["viewCredentials"] as const };
    expect(hasCapability(narrowDirector, "viewCredentials")).toBe(true);
    expect(hasCapability(narrowDirector, "viewReports")).toBe(false);
    // The SHIPPED Director does grant it — so the two genuinely disagree, by design.
    expect(templateGrants("Director", "viewReports")).toBe(true);
  });

  it("drops capability codes this build does not know, rather than trusting a row", () => {
    expect(toCapabilities(["viewReports", "flyToTheMoon", "viewAudit"])).toEqual([
      "viewReports",
      "viewAudit",
    ]);
    expect(toCapabilities([])).toEqual([]);
  });

  it("treats the Owner and Admin templates as superusers", () => {
    expect(hasCapability(asTemplate("Owner"), "manageUsers")).toBe(true);
    expect(hasCapability(asTemplate("Owner"), "purgeCandidate")).toBe(true);
    expect(hasCapability(asTemplate("Owner"), "deleteOpenRole")).toBe(true);
    expect(hasCapability(asTemplate("Admin"), "configureClientPortal")).toBe(true);
  });

  it("grants leadership (not admin) capabilities to Director", () => {
    expect(hasCapability(asTemplate("Director"), "viewReports")).toBe(true);
    expect(hasCapability(asTemplate("Director"), "viewCrm")).toBe(true);
    expect(hasCapability(asTemplate("Director"), "manageUsers")).toBe(false);
    expect(hasCapability(asTemplate("Director"), "purgeCandidate")).toBe(false);
  });

  it("gives Manager the numbers but not the PII and not business development", () => {
    expect(hasCapability(asTemplate("Manager"), "viewReports")).toBe(true);
    expect(hasCapability(asTemplate("Manager"), "viewAnalytics")).toBe(true);
    // Running a desk is not a reason to read licence numbers — that is the screening track.
    expect(hasCapability(asTemplate("Manager"), "viewCredentials")).toBe(false);
    expect(hasCapability(asTemplate("Manager"), "viewCrm")).toBe(false);
    expect(hasCapability(asTemplate("Manager"), "viewClientDiscovery")).toBe(false);
    expect(hasCapability(asTemplate("Manager"), "bulkImport")).toBe(false);
  });

  /**
   * Screener and Manager are two TRACKS, not two rungs: neither contains the other, and the PII
   * tier belongs to the one that screens clinicians. A test that assumed a single ladder would
   * quietly force licence numbers back onto Manager.
   */
  it("keeps the screening and desk tracks disjoint below leadership", () => {
    expect(hasCapability(asTemplate("Screener"), "viewCredentials")).toBe(true);
    expect(hasCapability(asTemplate("Screener"), "viewReports")).toBe(false);
    expect(hasCapability(asTemplate("Manager"), "viewCredentials")).toBe(false);
    expect(hasCapability(asTemplate("Manager"), "viewReports")).toBe(true);
  });

  it("lets a Screener read licences, because that is the job", () => {
    expect(hasCapability(asTemplate("Screener"), "viewCredentials")).toBe(true);
    expect(hasCapability(asTemplate("Screener"), "manageUsers")).toBe(false);
  });

  it("grants no capabilities at all to Associate", () => {
    expect(ROLE_CAPABILITIES.Associate).toHaveLength(0);
    expect(hasCapability(asTemplate("Associate"), "viewReports")).toBe(false);
    expect(hasCapability(asTemplate("Associate"), "viewCredentials")).toBe(false);
  });

  it("restricts viewAudit (PII-bearing audit trail) to admin/superuser, not leadership", () => {
    expect(hasCapability(asTemplate("Owner"), "viewAudit")).toBe(true);
    expect(hasCapability(asTemplate("Admin"), "viewAudit")).toBe(true);
    expect(hasCapability(asTemplate("Director"), "viewAudit")).toBe(false);
    expect(hasCapability(asTemplate("Manager"), "viewAudit")).toBe(false);
    expect(hasCapability(asTemplate("Screener"), "viewAudit")).toBe(false);
  });

  it("computes the leadership group from capabilities", () => {
    expect(isLeadership(asTemplate("Owner"))).toBe(true);
    expect(isLeadership(asTemplate("Director"))).toBe(true);
    expect(isLeadership(asTemplate("Manager"))).toBe(true);
    expect(isLeadership(asTemplate("Screener"))).toBe(false);
    expect(isLeadership(asTemplate("Associate"))).toBe(false);
  });

  /** Two templates granting the same set is a name a customer assigns expecting more. */
  it("gives each template a distinct grant, except the intended Owner/Admin pair", () => {
    const byGrant = new Map<string, Role[]>();
    for (const role of ROLES) {
      const key = [...ROLE_CAPABILITIES[role]].sort().join(",");
      byGrant.set(key, [...(byGrant.get(key) ?? []), role]);
    }
    expect([...byGrant.values()].filter((r) => r.length > 1)).toEqual([["Owner", "Admin"]]);
    expect(byGrant.size).toBe(5);
  });

  /**
   * `requireMayGrant` is vacuous only while the templates granting `manageRoles` grant everything.
   * This pins that, so giving it to a narrower template fails here rather than in production.
   */
  it("lets only all-powerful templates change roles, which is what keeps self-promotion impossible", () => {
    const everything = [...CAPABILITIES].sort().join(",");
    for (const role of ROLES) {
      if (!templateGrants(role, "manageRoles")) continue;
      expect(
        [...ROLE_CAPABILITIES[role]].sort().join(","),
        `${role} can change roles but does not hold every capability — requireMayGrant is now load-bearing`,
      ).toBe(everything);
    }
  });

  /**
   * Each track must nest, or a promotion silently removes access. The two converge at Director,
   * which is what makes a move from either track into leadership safe.
   */
  it("nests each track, so promotion within one never loses what a lower role had", () => {
    const tracks: Role[][] = [
      ["Associate", "Screener", "Director", "Owner"],
      ["Associate", "Manager", "Director", "Owner"],
    ];
    for (const track of tracks) {
      for (let i = 1; i < track.length; i += 1) {
        for (const capability of ROLE_CAPABILITIES[track[i - 1]!]) {
          expect(ROLE_CAPABILITIES[track[i]!], `${track[i]!} must keep ${capability}`).toContain(
            capability,
          );
        }
      }
    }
  });
});
