import "server-only";
import { statusLabel, type CandidateStatus } from "@/lib/constants";
import type { AlertBucketDTO, AlertCandidateDTO, AlertsDTO } from "@/lib/validation/alerts";
import type { AuthUser } from "@/server/auth/guards";
import { candidateRepository } from "@/server/repositories/candidate.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { mentionService } from "./mention.service";

/** Rows per derived bucket (legacy panel: `slice(0,5)`; the header shows the TRUE count). */
const BUCKET_ROWS = 5;

/** The raw bucket row `alertBuckets` selects (non-PII columns only). */
interface BucketRow {
  id: string;
  name: string;
  status: string;
  credential: string | null;
  clientId: string | null;
  licenseState: string | null;
}

function toBucketDTO(
  bucket: { count: number; items: BucketRow[] },
  clientNames: Map<string, string>,
): AlertBucketDTO {
  return {
    count: bucket.count,
    items: bucket.items.map((row): AlertCandidateDTO => ({
      id: row.id,
      name: row.name,
      statusLabel: statusLabel(row.status as CandidateStatus),
      credential: row.credential,
      clientName: row.clientId ? (clientNames.get(row.clientId) ?? null) : null,
      licenseState: row.licenseState,
    })),
  };
}

/**
 * The alerts-bell composite (legacy header "Alerts" pill parity): the viewer's mentions +
 * unread badge count (mentions ONLY — derived buckets never count toward the badge) + three
 * derived buckets scoped to candidates the VIEWER added (legacy `AddedBy === user`). Overdue
 * uses the same server predicate as the list/board chips, so the panel and the filters always
 * agree on who is overdue.
 */
export const alertService = {
  async forViewer(user: AuthUser): Promise<AlertsDTO> {
    const [mentionList, buckets, clients] = await Promise.all([
      mentionService.listMine(user),
      candidateRepository.alertBuckets(user.id, BUCKET_ROWS, new Date()),
      clientRepository.list(),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    return {
      mentions: mentionList.mentions,
      unread: mentionList.unread,
      overdue: toBucketDTO(buckets.overdue, clientNames),
      newToReview: toBucketDTO(buckets.newToReview, clientNames),
      verificationPending: toBucketDTO(buckets.verificationPending, clientNames),
    };
  },
};
