import "server-only";
import {
  hasCapability,
  type CandidateStatus,
  type LicenseStatus,
  type Role,
  type Track,
} from "@destaworks/domain/constants";
import type { CandidateRow } from "@destaworks/db/repositories/candidate.repository";
import type { RuleCandidate } from "@destaworks/domain/rules/types";
import type {
  CandidateProfileDTO,
  DocumentSummaryDTO,
  StageEventDTO,
} from "@destaworks/contracts/validation/candidate";
import type { StageHistoryRow } from "@destaworks/db/repositories/stage-history.repository";
import { isoOrNull, toIso } from "@destaworks/domain/utils/iso";
import type { DocumentDTO } from "./document.dto";

/** Minimal viewer shape the DTO needs — only the role drives the PII gate. */
export interface DtoViewer {
  role: Role;
}

/**
 * THE PUBLISHED SURFACE: the candidate columns every viewer may see, named one by one. This list
 * — not the Prisma model — decides what leaves the server, so a column added to `Candidate` is
 * published to nobody until someone adds it here. Every column must be classified here, in
 * `CANDIDATE_GATED_FIELDS`, or in `CANDIDATE_WITHHELD_FIELDS`; `dto-published-surface.test.ts`
 * fails on any column that is in none of them.
 */
export const CANDIDATE_PUBLISHED_FIELDS = [
  "id",
  "legacyId",
  "name",
  "email",
  "phone",
  "city",
  "state",
  "targetLocation",
  "employer",
  "yearsExp",
  "credential",
  "population",
  "setting",
  "telehealthPref",
  "track",
  "source",
  "tags",
  "outreachAttempts",
  "licenseState",
  "licenseStatus",
  "licenseExpiry",
  "licenseVerifiedAt",
  "licenseVerifiedById",
  "status",
  "stageOrder",
  "stageEnteredAt",
  "placedAt",
  "clientId",
  "filledFromRoleId",
  "createdById",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "deletedById",
] as const satisfies readonly (keyof CandidateRow)[];

/** Columns published ONLY to a viewer holding `viewCredentials` — the gate in `toCandidateDTO`. */
export const CANDIDATE_GATED_FIELDS = [
  "licenseNumber",
] as const satisfies readonly (keyof CandidateRow)[];

/** Columns no viewer ever receives, at any capability. */
export const CANDIDATE_WITHHELD_FIELDS = [] as const satisfies readonly (keyof CandidateRow)[];

type CandidatePublishedField = (typeof CANDIDATE_PUBLISHED_FIELDS)[number];
type CandidateGatedField = (typeof CANDIDATE_GATED_FIELDS)[number];
type CandidateWithheldField = (typeof CANDIDATE_WITHHELD_FIELDS)[number];

/** Resolves to `never` only when every candidate column is classified above; a new, undeclared
 *  column resolves to its own name and fails the `AssertNoUnclassified` constraint at typecheck. */
type UnclassifiedCandidateColumn = Exclude<
  keyof CandidateRow,
  CandidatePublishedField | CandidateGatedField | CandidateWithheldField
>;
type AssertNoUnclassified<T extends never> = T;
export type CandidateColumnsAllClassified = AssertNoUnclassified<UnclassifiedCandidateColumn>;

/**
 * Candidate as exposed to a viewer: exactly `CANDIDATE_PUBLISHED_FIELDS`, plus `licenseNumber`
 * only when the viewer holds `viewCredentials` (see `toCandidateDTO` — the PII boundary).
 */
export type CandidateDTO = Pick<CandidateRow, CandidatePublishedField> &
  Partial<Pick<CandidateRow, CandidateGatedField>>;

/**
 * Map a candidate row to its DTO. THE PII BOUNDARY: fields are copied one by one (never spread
 * off the row), so an unlisted column cannot ride along, and `licenseNumber` (sensitive PII) is
 * omitted — key absent, not null — unless the viewer has `viewCredentials`. Everything
 * server-side above this mapper works on the raw row.
 */
export function toCandidateDTO(row: CandidateRow, viewer: DtoViewer): CandidateDTO {
  const dto: CandidateDTO = {
    id: row.id,
    legacyId: row.legacyId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    state: row.state,
    targetLocation: row.targetLocation,
    employer: row.employer,
    yearsExp: row.yearsExp,
    credential: row.credential,
    population: row.population,
    setting: row.setting,
    telehealthPref: row.telehealthPref,
    track: row.track,
    source: row.source,
    tags: row.tags,
    outreachAttempts: row.outreachAttempts,
    licenseState: row.licenseState,
    licenseStatus: row.licenseStatus,
    licenseExpiry: row.licenseExpiry,
    licenseVerifiedAt: row.licenseVerifiedAt,
    licenseVerifiedById: row.licenseVerifiedById,
    status: row.status,
    stageOrder: row.stageOrder,
    stageEnteredAt: row.stageEnteredAt,
    placedAt: row.placedAt,
    clientId: row.clientId,
    filledFromRoleId: row.filledFromRoleId,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
    deletedById: row.deletedById,
  };
  if (hasCapability(viewer.role, "viewCredentials")) dto.licenseNumber = row.licenseNumber;
  return dto;
}

/** The fields `toRuleCandidate` actually reads — a `Pick`, not the full row, so it accepts either
 *  `CandidateRow` or the leaner `CandidateCardRow` (no `licenseNumber`) without a cast. */
export type RuleCandidateSource = Pick<
  CandidateRow,
  | "status"
  | "track"
  | "credential"
  | "licenseState"
  | "licenseStatus"
  | "licenseExpiry"
  | "population"
  | "setting"
  | "clientId"
  | "email"
  | "phone"
>;

/**
 * Project a candidate row onto the minimal `RuleCandidate` the pure rules operate on
 * (`scoreCandidate`, `checkStageGate`, timing). Stored strings are cast to their constant
 * unions — values are validated with zod on write, so the cast is safe at read time.
 */
export function toRuleCandidate(row: RuleCandidateSource): RuleCandidate {
  return {
    status: row.status as CandidateStatus,
    track: row.track as Track,
    credential: row.credential,
    licenseState: row.licenseState,
    licenseStatus: row.licenseStatus as LicenseStatus,
    licenseExpiry: row.licenseExpiry,
    population: row.population,
    setting: row.setting,
    clientId: row.clientId,
    email: row.email,
    phone: row.phone,
  };
}

/**
 * Project the PII-gated candidate DTO onto the serialized `CandidateProfileDTO` (ISO string dates).
 * `licenseNumber` is carried ONLY when `toCandidateDTO` included it (viewer had `viewCredentials`) —
 * the gate is inherited from the DTO, never re-decided here.
 */
export function toCandidateProfileDTO(dto: CandidateDTO): CandidateProfileDTO {
  const profile: CandidateProfileDTO = {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    phone: dto.phone,
    city: dto.city,
    state: dto.state,
    targetLocation: dto.targetLocation,
    employer: dto.employer,
    yearsExp: dto.yearsExp,
    credential: dto.credential,
    population: dto.population,
    setting: dto.setting,
    telehealthPref: dto.telehealthPref,
    track: dto.track,
    source: dto.source,
    tags: dto.tags,
    outreachAttempts: dto.outreachAttempts,
    licenseState: dto.licenseState,
    licenseStatus: dto.licenseStatus,
    licenseExpiry: isoOrNull(dto.licenseExpiry),
    licenseVerifiedAt: isoOrNull(dto.licenseVerifiedAt),
    licenseVerifiedById: dto.licenseVerifiedById,
    status: dto.status,
    stageOrder: dto.stageOrder,
    stageEnteredAt: toIso(dto.stageEnteredAt),
    placedAt: isoOrNull(dto.placedAt),
    clientId: dto.clientId,
    createdById: dto.createdById,
    createdAt: toIso(dto.createdAt),
    updatedAt: toIso(dto.updatedAt),
  };
  // Present only when the gate let it through (key absence, not null, means "hidden").
  if ("licenseNumber" in dto) profile.licenseNumber = dto.licenseNumber;
  return profile;
}

/** Project the PII-gated document DTO onto the serialized `DocumentSummaryDTO`. */
export function toDocumentSummaryDTO(dto: DocumentDTO): DocumentSummaryDTO {
  const summary: DocumentSummaryDTO = {
    id: dto.id,
    candidateId: dto.candidateId,
    type: dto.type,
    originalFilename: dto.originalFilename,
    mimeType: dto.mimeType,
    sizeBytes: dto.sizeBytes,
    storageKey: dto.storageKey,
    legacyUrl: dto.legacyUrl,
    createdAt: toIso(dto.createdAt),
  };
  // Both fields ride together through the same `viewCredentials` gate in `toDocumentDTO`.
  if ("extractedText" in dto) summary.extractedText = dto.extractedText;
  if ("extractedData" in dto) summary.extractedData = dto.extractedData;
  return summary;
}

/** Project a stage-history row onto the serialized `StageEventDTO` (actor-name resolve deferred). */
export function toStageEventDTO(row: StageHistoryRow): StageEventDTO {
  return {
    id: row.id,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fromStageOrder: row.fromStageOrder,
    toStageOrder: row.toStageOrder,
    enteredAt: toIso(row.enteredAt),
    actorId: row.actorId,
  };
}
