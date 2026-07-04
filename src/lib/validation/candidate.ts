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

/** The single composite payload the RSC loads and seeds the client detail page with. */
export interface CandidateDetailDTO {
  candidate: CandidateProfileDTO;
  clientName: string | null;
  documents: DocumentSummaryDTO[];
  notes: NoteDTO[]; // already role-scoped server-side
  stageHistory: StageEventDTO[]; // recent 10, desc
  canVerifyCredentials: boolean;
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
