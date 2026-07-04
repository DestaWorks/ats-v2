import "server-only";
import {
  hasCapability,
  type CandidateStatus,
  type LicenseStatus,
  type Role,
  type Track,
} from "@/lib/constants";
import type { CandidateRow } from "@/server/repositories/candidate.repository";
import type { RuleCandidate } from "@/lib/rules/types";
import type {
  CandidateProfileDTO,
  DocumentSummaryDTO,
  StageEventDTO,
} from "@/lib/validation/candidate";
import type { StageHistoryRow } from "@/server/repositories/stage-history.repository";
import { isoOrNull, toIso } from "@/lib/utils/iso";
import type { DocumentDTO } from "./document.dto";

/** Minimal viewer shape the DTO needs — only the role drives the PII gate. */
export interface DtoViewer {
  role: Role;
}

/**
 * Candidate as exposed to a viewer. Everything from the row except `licenseNumber`, which is
 * present only when the viewer holds `viewCredentials` (see `toCandidateDTO` — the PII boundary).
 */
export type CandidateDTO = Omit<CandidateRow, "licenseNumber"> & { licenseNumber?: string | null };

/**
 * Map a candidate row to its DTO. THE PII BOUNDARY: `licenseNumber` (sensitive PII) is omitted
 * unless the viewer has `viewCredentials`. Everything server-side above this mapper works on the
 * raw row; nothing below the API returns `licenseNumber` to an unauthorized viewer.
 */
export function toCandidateDTO(row: CandidateRow, viewer: DtoViewer): CandidateDTO {
  const { licenseNumber, ...rest } = row;
  if (hasCapability(viewer.role, "viewCredentials")) {
    return { ...rest, licenseNumber };
  }
  return rest;
}

/**
 * Project a candidate row onto the minimal `RuleCandidate` the pure rules operate on
 * (`scoreCandidate`, `checkStageGate`, timing). Stored strings are cast to their constant
 * unions — values are validated with zod on write, so the cast is safe at read time.
 */
export function toRuleCandidate(row: CandidateRow): RuleCandidate {
  return {
    status: row.status as CandidateStatus,
    track: row.track as Track,
    credential: row.credential,
    licenseState: row.licenseState,
    licenseStatus: row.licenseStatus as LicenseStatus,
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
    employer: dto.employer,
    yearsExp: dto.yearsExp,
    credential: dto.credential,
    population: dto.population,
    setting: dto.setting,
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
