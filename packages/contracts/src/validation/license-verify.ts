/**
 * License Verify dashboard DTOs (Wave 3.4) — DTO-only (no request body of its own; this feature
 * only reads and links out to the existing `/candidates/:id` verify form). Mirrors
 * `validation/screening.ts`'s DTO-only-file pattern.
 */

export interface LicenseVerifyQueueRowDTO {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
  clientName: string | null;
  licenseStatus: string;
}

export interface LicenseVerifyTimelineRowDTO {
  id: string;
  name: string;
  credential: string | null;
  licenseState: string | null;
  licenseExpiry: string; // ISO
  daysLeft: number;
}

export interface LicenseVerifyDashboardDTO {
  queue: LicenseVerifyQueueRowDTO[];
  timeline: LicenseVerifyTimelineRowDTO[];
  /** True when the queue read hit its operational cap — the page shows a "first N" note. */
  queueTruncated: boolean;
}
