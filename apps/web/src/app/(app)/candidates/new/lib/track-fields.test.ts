import { describe, it, expect } from "vitest";
import { trackFieldVisibility } from "./track-fields";

/**
 * `trackFieldVisibility` — the pure add-candidate field-visibility rule. Clinical tracks
 * (Clinical/Prescriber) show credential + license-state; Operations hides them. License-NUMBER is
 * additionally PII-gated: only when the license block shows AND the viewer holds `viewCredentials`.
 */
describe("trackFieldVisibility", () => {
  it("shows credential + license-state for the clinical tracks", () => {
    for (const track of ["Clinical", "Prescriber"] as const) {
      const v = trackFieldVisibility(track, false);
      expect(v.showCredential).toBe(true);
      expect(v.showLicenseState).toBe(true);
    }
  });

  it("hides credential + license fields for Operations, even with clearance", () => {
    const v = trackFieldVisibility("Operations", true);
    expect(v.showCredential).toBe(false);
    expect(v.showLicenseState).toBe(false);
    expect(v.showLicenseNumber).toBe(false);
  });

  it("gates license-number behind viewCredentials on a clinical track", () => {
    expect(trackFieldVisibility("Clinical", false).showLicenseNumber).toBe(false);
    expect(trackFieldVisibility("Clinical", true).showLicenseNumber).toBe(true);
  });
});
