import type { LicenseStatus } from "@/lib/constants";
import { utcNextDayStart } from "@/lib/daily";
import type { RuleCandidate } from "./types";

/**
 * The single source of truth for "is this license actually good right now?".
 *
 * `licenseStatus` is a *point-in-time verification result* — nothing re-reads it after a
 * recruiter sets it. Before this helper existed (audit 2026-08-21) a license verified `Active`
 * in January with `licenseExpiry` in March still scored the full 10/10, passed the
 * submit-to-client gate, and returned no auto-disqualify reason in August: the expiry column
 * drove the `/license-verify` timeline display and nothing else. Gates, scoring and DQ now all
 * go through here, so an expired license behaves exactly like a manually-set `Expired`.
 *
 * `licenseExpiry` is a DATE-ONLY value nominally stored at UTC midnight (`z.coerce.date()` over
 * an `<input type="date">`), and a license is valid THROUGH its expiry date — so the demotion
 * fires only once the following UTC day has begun, never on the expiry date itself. Erring
 * later is deliberate: a false `Expired` blocks a legitimate submission, which is the more
 * costly mistake. The boundary is derived with `utcNextDayStart` rather than "+ 24h" so an
 * imported row that carries a stray time-of-day still gets the whole of its expiry date.
 *
 * `now` is REQUIRED — a rule is told the time, it never reads the clock (`lib/clock.ts`).
 */
export function effectiveLicenseStatus(
  candidate: RuleCandidate,
  now: Date,
): LicenseStatus | null | undefined {
  const status = candidate.licenseStatus;
  if (status !== "Active" || !candidate.licenseExpiry) return status;
  return now.getTime() >= utcNextDayStart(candidate.licenseExpiry).getTime() ? "Expired" : status;
}

/** Has the license lapsed since it was verified? (`Expired` set by hand is NOT "lapsed".) */
export function isLicenseLapsed(candidate: RuleCandidate, now: Date): boolean {
  return (
    candidate.licenseStatus === "Active" && effectiveLicenseStatus(candidate, now) === "Expired"
  );
}
