/**
 * Candidate detail contract (Wave 2.2 + 2.3) — the isomorphic interface shared by the detail
 * read service, the edit / verify-license / notes routes, and the client detail page. Pure types
 * + zod (NO server imports), so the frontend validates against exactly the shapes the server does.
 *
 * See `docs/design/wave-2.3-candidate-detail.md`. Wire dates are ISO strings (both `Response.json`
 * and the RSC serializer produce strings), so every DTO date here is `string`. `licenseNumber` and
 * document `extractedText`/`extractedData` are PII-gated server-side (present only for a viewer with
 * `viewCredentials`) — the optional fields below mirror that boundary.
 */
import { z } from "zod";
import {
  CREDENTIALS,
  LICENSE_STATUSES,
  NOTE_TYPES,
  POPULATIONS,
  SETTINGS,
  SOURCES,
  TAGS,
  TRACKS,
  US_STATES,
  type NoteType,
} from "@/lib/constants";

// --- response DTOs (serialized wire shapes) ---------------------------------

/** One pipeline transition (recent-history list on the detail header). */
export interface StageEventDTO {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  fromStageOrder: number | null;
  toStageOrder: number;
  enteredAt: string; // ISO
  actorId: string; // resolving actorId → display name is deferred (OQ-5)
}

/**
 * A candidate note. `body` is RAW text — the client renders it as ESCAPED plain text via React
 * children (NEVER `dangerouslySetInnerHTML`; fixes the legacy stored-XSS).
 */
export interface NoteDTO {
  id: string;
  body: string;
  noteType: NoteType;
  authorId: string;
  authorName: string | null;
  createdAt: string; // ISO
}

/** A résumé/document row (metadata + link; no byte preview). `extracted*` are PII-gated. */
export interface DocumentSummaryDTO {
  id: string;
  candidateId: string | null;
  type: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number | null;
  storageKey: string | null;
  legacyUrl: string | null;
  createdAt: string; // ISO
  extractedText?: string | null; // gated (viewCredentials)
  extractedData?: unknown; // gated (viewCredentials)
}

/**
 * The candidate profile the detail page renders. Mirrors the server `toCandidateDTO` PII gate:
 * `licenseNumber` is present only for a viewer with `viewCredentials`. Dates are ISO strings.
 */
export interface CandidateProfileDTO {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  employer: string | null;
  yearsExp: number | null;
  credential: string | null;
  population: string | null;
  setting: string | null;
  track: string;
  source: string | null;
  tags: string[];
  outreachAttempts: number;
  licenseState: string | null;
  licenseNumber?: string | null; // gated (viewCredentials)
  licenseStatus: string;
  licenseExpiry: string | null; // ISO
  licenseVerifiedAt: string | null; // ISO
  licenseVerifiedById: string | null;
  status: string;
  stageOrder: number;
  stageEnteredAt: string; // ISO
  placedAt: string | null; // ISO
  clientId: string | null;
  createdById: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/**
 * One row in the `/candidates` browse list — a PII-gated summary distinct from the board card.
 * Mirrors the server `toCandidateDTO` boundary: NO `licenseNumber` (and no other sensitive PII).
 * `status` is the stable code (for styling / links); `statusLabel` is the display string.
 */
export interface CandidateListItemDTO {
  id: string;
  name: string;
  credential: string | null;
  track: string;
  clientName: string | null;
  status: string; // stable code
  statusLabel: string;
  licenseStatus: string;
  daysInStage: number;
  /** When the candidate was added (ISO). Shown as the "Created" column and drives Newest/Oldest sort. */
  createdAt: string;
  /**
   * Candidate's fit for the assigned client as a `pct` (0–100), or `null` when there's nothing to
   * score against. The list is sorted by this desc (nulls last). `null` renders as "—", not "0%".
   */
  score: number | null;
  /** ADVISORY auto-disqualify reasons (display-only, never auto-moves). Empty when clear. */
  dqFlags: string[];
}

/**
 * The `/candidates` browse payload — a server OFFSET page. Every concern resolves on the server:
 * filters (SQL `WHERE`), sort (DB `ORDER BY` for newest/oldest, in-memory fit-score sort for `fit`),
 * and pagination (`skip`/`take`). `candidates` is exactly the requested page (`pageSize` rows, fewer
 * on the last page); `total` is the true filtered count; `page` is clamped to `[1, totalPages]`.
 * `hasPrev`/`hasNext` drive the pager. The client renders what it's given and only changes URL params.
 */
export interface CandidateListDTO {
  candidates: CandidateListItemDTO[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

/**
 * One row in the `/trash` view — a PII-gated summary of a soft-deleted candidate (Wave 2.5).
 * Mirrors the server `toCandidateDTO` boundary: NO `licenseNumber` (Trash never surfaces sensitive
 * PII). `statusLabel` is the display string for the status the candidate held AT deletion (delete
 * never touches `status`). `deletedByName` is the resolved actor display name, or `null` when the
 * actor is unknown / since-removed.
 */
export interface CandidateTrashItemDTO {
  id: string;
  name: string;
  credential: string | null;
  clientName: string | null;
  status: string; // stable code
  statusLabel: string; // status at deletion (unchanged by delete)
  deletedAt: string; // ISO
  deletedByName: string | null;
}

/** The `/trash` payload — soft-deleted candidates, newest-deleted first. */
export interface CandidateTrashDTO {
  items: CandidateTrashItemDTO[];
}

/** The single composite payload the RSC loads and seeds the client detail page with. */
export interface CandidateDetailDTO {
  candidate: CandidateProfileDTO;
  clientName: string | null;
  documents: DocumentSummaryDTO[];
  notes: NoteDTO[]; // already role-scoped server-side
  stageHistory: StageEventDTO[]; // recent 10, desc
  canVerifyCredentials: boolean;
  /**
   * Fit breakdown for the assigned client — `pct`/`score`/`max`, the soft `flags` (why it isn't 100),
   * and the ADVISORY `autoDisqualify` reasons (display-only — NEVER an automatic status change).
   * `null` when there's nothing to score against (no client / no rules / the rules constrain nothing).
   */
  scoring: {
    pct: number;
    score: number;
    max: number;
    flags: string[];
    autoDisqualify: string[];
  } | null;
}

// --- request schemas (server validates; client reuses) ----------------------

/**
 * Editable profile fields for `PATCH /api/candidates/:id`. `.strict()` rejects any unknown or
 * forbidden key (status / stageOrder / licenseStatus / licenseExpiry / verification columns) with
 * a 422 — pipeline movement stays owned by `move` and license VERIFICATION by `verify-license`
 * (design D-5). `licenseNumber` is accepted here only for a viewer with `viewCredentials`; the
 * route strips/rejects it otherwise.
 */
export const updateCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    city: z.string().trim().max(120).nullish(),
    state: z.enum(US_STATES).nullish(),
    employer: z.string().trim().max(200).nullish(),
    yearsExp: z.number().int().min(0).max(80).nullish(),
    credential: z.enum(CREDENTIALS).nullish(),
    population: z.enum(POPULATIONS).nullish(),
    setting: z.enum(SETTINGS).nullish(),
    track: z.enum(TRACKS).optional(),
    source: z.enum(SOURCES).nullish(),
    tags: z.array(z.enum(TAGS)).max(20).optional(),
    licenseState: z.enum(US_STATES).nullish(),
    clientId: z.string().min(1).nullish(),
    licenseNumber: z.string().trim().max(100).nullish(), // route strips unless viewCredentials
  })
  .strict();
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

/**
 * Body for `POST /api/candidates` — manually create a candidate (Wave 2.4, Module 5). Mirrors
 * `updateCandidateSchema` but `name` is REQUIRED and `track` carries a default, so a bare `{ name }`
 * is a valid create. `.strict()` rejects any unknown or forbidden key: `status`/`stageOrder` and
 * pipeline timing stay owned by `move` (every interactive create starts at `NEW_CANDIDATE`, stage 0),
 * and `licenseExpiry`/verification columns stay owned by `verify-license` — so a create can never drop
 * a candidate mid-pipeline or forge a verification. `licenseNumber` is accepted here only for a viewer
 * with `viewCredentials`; the route rejects it (403) otherwise (mirrors the PATCH gate).
 */
export const createCandidateSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    city: z.string().trim().max(120).nullish(),
    state: z.enum(US_STATES).nullish(),
    employer: z.string().trim().max(200).nullish(),
    yearsExp: z.number().int().min(0).max(80).nullish(),
    credential: z.enum(CREDENTIALS).nullish(),
    population: z.enum(POPULATIONS).nullish(),
    setting: z.enum(SETTINGS).nullish(),
    track: z.enum(TRACKS).default("Clinical"),
    source: z.enum(SOURCES).nullish(),
    tags: z.array(z.enum(TAGS)).max(20).optional(),
    licenseState: z.enum(US_STATES).nullish(),
    clientId: z.string().min(1).nullish(),
    licenseNumber: z.string().trim().max(100).nullish(), // route rejects unless viewCredentials
  })
  .strict();
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

/**
 * Body for `POST /api/candidates/:id/verify-license`. Sets the verification status (+ optional
 * expiry / number); the service stamps who/when. `licenseNumber` requires `viewCredentials`.
 */
export const verifyLicenseSchema = z
  .object({
    licenseStatus: z.enum(LICENSE_STATUSES),
    licenseExpiry: z.coerce.date().nullish(),
    licenseNumber: z.string().trim().max(100).nullish(), // route strips unless viewCredentials
  })
  .strict();
export type VerifyLicenseInput = z.infer<typeof verifyLicenseSchema>;

/**
 * Body for `POST /api/candidates/:id/notes`. Body is stored RAW (the XSS defense is at render —
 * escaped React children, never `dangerouslySetInnerHTML`); zod only bounds length + non-empty.
 * `authorId`/`authorName` come from the server session, never the client body.
 */
export const addNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    noteType: z.enum(NOTE_TYPES).default("internal"),
  })
  .strict();
export type AddNoteInput = z.infer<typeof addNoteSchema>;
