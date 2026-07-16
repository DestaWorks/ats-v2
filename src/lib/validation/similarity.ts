/**
 * Smarter Sourcing "find similar" contract (Wave 3.2) — the anchor input + result DTOs for
 * `POST /api/sourcing/similar`. `credential` is client-supplied at the same trust level as
 * Discover's own search form (this only searches public NPPES data — no privilege boundary
 * crossed by trusting it). No add-to-sourcing schema here: results reuse the existing
 * `discoverAddRowSchema`/`POST /api/discover/add` unchanged (see `SimilarProviderDTO`'s field
 * overlap with `DiscoverResultItemDTO`).
 */
import { z } from "zod";

export const findSimilarSchema = z
  .object({
    credential: z.string().trim().max(120).nullish(),
    state: z.string().trim().max(60).nullish(),
  })
  .strict();
export type FindSimilarInput = z.infer<typeof findSimilarSchema>;

export interface SimilarProviderDTO {
  npi: string;
  name: string;
  credential: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  taxonomyDesc: string | null;
  licenseNumber: string | null;
  similarityScore: number;
}

export interface FindSimilarResultDTO {
  /** The taxonomy label actually searched (e.g. "Psychiatric NP (PMHNP)") — echoed back so the UI
   *  can show what was searched, not just the raw anchor credential string. */
  taxonomyLabel: string;
  results: SimilarProviderDTO[];
}
