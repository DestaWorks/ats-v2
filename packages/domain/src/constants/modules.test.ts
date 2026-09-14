import { describe, it, expect } from "vitest";
import { CAPABILITIES } from "./roles";
import {
  CAPABILITY_MODULE,
  MODULE_LABEL,
  MODULES,
  PLANS,
  PLAN_MODULES,
  CORE_MODULE,
  FALLBACK_PLAN,
  isModule,
  isPlan,
  toPlan,
  modulesForPlan,
  hasModule,
  type Plan,
} from "./modules";

describe("modules & plans", () => {
  it("guards module and plan strings", () => {
    expect(isModule("reports")).toBe(true);
    expect(isModule("Reports")).toBe(false);
    expect(isPlan("growth")).toBe(true);
    expect(isPlan("enterprise")).toBe(false);
  });

  it("collapses an unrecognised plan to the least entitled one", () => {
    expect(toPlan("enterprise-platinum")).toBe(FALLBACK_PLAN);
    expect(toPlan(null)).toBe(FALLBACK_PLAN);
    expect(toPlan(undefined)).toBe(FALLBACK_PLAN);
    expect(toPlan("scale")).toBe("scale");
  });

  it("gives every plan the core module, whatever it lists", () => {
    for (const plan of PLANS) expect(modulesForPlan(plan)).toContain(CORE_MODULE);
    expect(modulesForPlan("nonsense")).toContain(CORE_MODULE);
  });

  it("entitles a trial to everything", () => {
    expect([...modulesForPlan("trial")].sort()).toEqual([...MODULES].sort());
  });

  /**
   * `internal` predates this vocabulary and is what Desta Works' OWN workspace carries. Leaving it
   * out silently collapsed the vendor to `starter` and stripped six modules from their own app.
   */
  it("entitles the vendor's own workspace to everything", () => {
    expect(isPlan("internal")).toBe(true);
    expect([...modulesForPlan("internal")].sort()).toEqual([...MODULES].sort());
  });

  it("sells reports and discovery above the entry tier", () => {
    expect(hasModule(modulesForPlan("starter"), "reports")).toBe(false);
    expect(hasModule(modulesForPlan("growth"), "reports")).toBe(true);
    expect(hasModule(modulesForPlan("growth"), "discovery")).toBe(false);
    expect(hasModule(modulesForPlan("scale"), "discovery")).toBe(true);
  });

  /** An upgrade that removed a module would silently break a workspace mid-contract. */
  it("makes the paid tiers cumulative, so upgrading only ever adds", () => {
    const ladder: Plan[] = ["starter", "growth", "scale"];
    for (let i = 1; i < ladder.length; i += 1) {
      for (const included of PLAN_MODULES[ladder[i - 1]!]) {
        expect(PLAN_MODULES[ladder[i]!], `${ladder[i]!} must keep ${included}`).toContain(included);
      }
    }
  });

  it("names only real modules in every plan", () => {
    for (const plan of PLANS) {
      for (const included of PLAN_MODULES[plan]) expect(isModule(included)).toBe(true);
    }
  });

  /** A capability filed under no module would vanish from the role editor's grouped list. */
  it("files every capability under a module, and only under a real one", () => {
    for (const capability of CAPABILITIES) {
      const owner = CAPABILITY_MODULE[capability];
      expect(owner, `${capability} is in no module`).toBeDefined();
      expect(isModule(owner!)).toBe(true);
    }
    expect(Object.keys(CAPABILITY_MODULE).sort()).toEqual([...CAPABILITIES].sort());
  });

  it("labels every module, so no section heading renders blank", () => {
    for (const name of MODULES) expect(MODULE_LABEL[name]).toBeTruthy();
  });
});
