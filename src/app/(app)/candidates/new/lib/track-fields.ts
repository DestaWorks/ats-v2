import type { Track } from "@/lib/constants";

/**
 * Which credential/license fields the add-candidate form shows for a given track (Wave 2.4). Pure +
 * isomorphic so it can be unit-tested and reused by the client form. The stage gates treat
 * everything non-`Operations` the same (a Clinical/Prescriber candidate needs a credential + license;
 * Operations needs only contact info — see `STAGE_REQUIRED`), so credential + license-state show for
 * the clinical tracks and hide for Operations. `licenseNumber` is additionally PII-gated: it shows
 * only when the license block is visible AND the viewer holds `viewCredentials`.
 */
export interface TrackFieldVisibility {
  showCredential: boolean;
  showLicenseState: boolean;
  showLicenseNumber: boolean;
}

/** Derive the credential/license field visibility from the selected track + the viewer's PII clearance. */
export function trackFieldVisibility(
  track: Track,
  canEditCredential: boolean,
): TrackFieldVisibility {
  const clinical = track !== "Operations";
  return {
    showCredential: clinical,
    showLicenseState: clinical,
    showLicenseNumber: clinical && canEditCredential,
  };
}
