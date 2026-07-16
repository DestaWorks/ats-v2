import "server-only";
import type {
  LicenseVerifyDashboardDTO,
  LicenseVerifyQueueRowDTO,
  LicenseVerifyTimelineRowDTO,
} from "@/lib/validation/license-verify";
import { toIso } from "@/lib/utils/iso";
import { clientRepository } from "@/server/repositories/client.repository";
import { licenseVerifyRepository } from "@/server/repositories/license-verify.repository";

/** Operational cap on the queue read — legacy had none, but this many at once would be unusual. */
const QUEUE_CAP = 100;
/** Timeline row cap — matches legacy's `.slice(0,12)` (`legacy/index.html:3030`). */
const TIMELINE_CAP = 12;
const MS_PER_DAY = 86_400_000;

type QueueRow = Awaited<
  ReturnType<typeof licenseVerifyRepository.verificationQueue>
>["rows"][number];
type TimelineRow = Awaited<ReturnType<typeof licenseVerifyRepository.expiryTimeline>>[number];

function toQueueRowDTO(c: QueueRow, clientNames: Map<string, string>): LicenseVerifyQueueRowDTO {
  return {
    id: c.id,
    name: c.name,
    credential: c.credential,
    licenseState: c.licenseState,
    clientName: c.clientId ? (clientNames.get(c.clientId) ?? null) : null,
    licenseStatus: c.licenseStatus,
  };
}

function toTimelineRowDTO(c: TimelineRow, now: Date): LicenseVerifyTimelineRowDTO {
  // Guaranteed non-null by expiryTimeline's `where` clause.
  const expiry = c.licenseExpiry!;
  return {
    id: c.id,
    name: c.name,
    credential: c.credential,
    licenseState: c.licenseState,
    licenseExpiry: toIso(expiry),
    daysLeft: Math.floor((expiry.getTime() - now.getTime()) / MS_PER_DAY),
  };
}

/**
 * License Verify dashboard (Wave 3.4) — a read-only Verification Queue + Expiry Timeline, ported
 * from legacy's Credentials Intelligence module (`legacy/index.html:3001-3037`). Legacy's queue has
 * no inline verify form — clicking a candidate just opens the detail modal, where the real verify
 * form lives; that's already built here as `LicenseTab`/`POST /api/candidates/:id/verify-license`.
 * This service only derives the two read lists; verification itself happens on `/candidates/:id`.
 */
export const licenseVerifyService = {
  async dashboard(now: Date = new Date()): Promise<LicenseVerifyDashboardDTO> {
    const [queue, timelineRows, clientNames] = await Promise.all([
      licenseVerifyRepository.verificationQueue(QUEUE_CAP),
      licenseVerifyRepository.expiryTimeline(TIMELINE_CAP),
      clientRepository.nameMap(),
    ]);
    return {
      queue: queue.rows.map((c) => toQueueRowDTO(c, clientNames)),
      timeline: timelineRows.map((c) => toTimelineRowDTO(c, now)),
      queueTruncated: queue.hasMore,
    };
  },
};
