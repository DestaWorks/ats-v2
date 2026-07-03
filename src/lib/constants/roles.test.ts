import { describe, it, expect } from "vitest";
import { ROLES, isRole, hasCapability, isLeadership, ROLE_CAPABILITIES } from "./roles";

describe("roles & capabilities", () => {
  it("has exactly the six fixed roles", () => {
    expect(ROLES).toEqual(["Owner", "Director", "Manager", "Screener", "Associate", "Admin"]);
  });

  it("guards role strings", () => {
    expect(isRole("Owner")).toBe(true);
    expect(isRole("admin")).toBe(false); // exact-cased; "Admin" is the value
    expect(isRole("Superuser")).toBe(false);
  });

  it("treats Owner and Admin as superusers", () => {
    expect(hasCapability("Owner", "manageUsers")).toBe(true);
    expect(hasCapability("Owner", "purgeCandidate")).toBe(true);
    expect(hasCapability("Admin", "configureClientPortal")).toBe(true);
  });

  it("grants leadership (not admin) capabilities to Director/Manager", () => {
    expect(hasCapability("Director", "viewReports")).toBe(true);
    expect(hasCapability("Manager", "viewCrm")).toBe(true);
    expect(hasCapability("Director", "manageUsers")).toBe(false);
    expect(hasCapability("Manager", "purgeCandidate")).toBe(false);
  });

  it("grants no privileged capabilities to Screener/Associate", () => {
    expect(ROLE_CAPABILITIES.Screener).toHaveLength(0);
    expect(ROLE_CAPABILITIES.Associate).toHaveLength(0);
    expect(hasCapability("Associate", "viewReports")).toBe(false);
    expect(hasCapability("Screener", "bulkImport")).toBe(false);
  });

  it("restricts viewAudit (PII-bearing audit trail) to admin/superuser, not leadership", () => {
    expect(hasCapability("Owner", "viewAudit")).toBe(true);
    expect(hasCapability("Admin", "viewAudit")).toBe(true);
    // Leadership managers get reports/CRM but NOT the PII-bearing audit trail.
    expect(hasCapability("Director", "viewAudit")).toBe(false);
    expect(hasCapability("Manager", "viewAudit")).toBe(false);
    expect(hasCapability("Associate", "viewAudit")).toBe(false);
    expect(hasCapability("Screener", "viewAudit")).toBe(false);
  });

  it("computes the leadership group correctly", () => {
    expect(isLeadership("Owner")).toBe(true);
    expect(isLeadership("Director")).toBe(true);
    expect(isLeadership("Manager")).toBe(true);
    expect(isLeadership("Admin")).toBe(true);
    expect(isLeadership("Screener")).toBe(false);
    expect(isLeadership("Associate")).toBe(false);
  });
});
