/**
 * Open Roles contract (Wave 3.5) — isomorphic types + zod shared by the role routes and the
 * `/roles` client. Role vocab fields (credential/state/setting/population) use the SAME strict
 * enums as Candidate (tighter than legacy's free text) so the matcher's exact/partial comparisons
 * are reliable; `rate` stays free text (legacy has no structured min/max either).
 */
import { z } from "zod";
import {
  CREDENTIALS,
  POPULATIONS,
  ROLE_PRIORITIES,
  ROLE_STATUSES,
  SETTINGS,
  US_STATES,
  type LeadStatus,
  type RolePriority,
  type RoleStatus,
  type TriageBadge,
} from "@/lib/constants";
import type { PageMeta } from "@/lib/pagination";

export const createOpenRoleSchema = z
  .object({
    clientId: z.string().min(1),
    title: z.string().trim().min(1).max(200),
    credential: z.enum(CREDENTIALS).nullish(),
    state: z.enum(US_STATES).nullish(),
    city: z.string().trim().max(120).nullish(),
    setting: z.enum(SETTINGS).nullish(),
    population: z.enum(POPULATIONS).nullish(),
    rate: z.string().trim().max(120).nullish(),
    description: z.string().trim().max(4000).nullish(),
    priority: z.enum(ROLE_PRIORITIES).default("P2"),
  })
  .strict();
export type CreateOpenRoleInput = z.infer<typeof createOpenRoleSchema>;

/** Query params for `GET /api/roles`. */
export const roleListQuerySchema = z.object({
  clientId: z.string().trim().min(1).optional(),
  status: z.enum(ROLE_STATUSES).optional(),
  priority: z.enum(ROLE_PRIORITIES).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).optional(),
});

/** Body for `PATCH /api/roles/:id` — every field optional, incl. `status` (legacy has no gate machine). */
export const updateOpenRoleSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    credential: z.enum(CREDENTIALS).nullish(),
    state: z.enum(US_STATES).nullish(),
    city: z.string().trim().max(120).nullish(),
    setting: z.enum(SETTINGS).nullish(),
    population: z.enum(POPULATIONS).nullish(),
    rate: z.string().trim().max(120).nullish(),
    description: z.string().trim().max(4000).nullish(),
    priority: z.enum(ROLE_PRIORITIES).optional(),
    status: z.enum(ROLE_STATUSES).optional(),
    assignedToId: z.string().min(1).nullish(),
    clientId: z.string().min(1).optional(),
  })
  .strict();
export type UpdateOpenRoleInput = z.infer<typeof updateOpenRoleSchema>;

export const addRoleNoteSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
    category: z.string().trim().min(1).max(60).default("General"),
  })
  .strict();
export type AddRoleNoteInput = z.infer<typeof addRoleNoteSchema>;

/** Reasonable bounds on a tunable weight — legacy has none, but an unbounded value can invert the scale. */
const weight = () => z.number().int().min(0).max(200);

/** Body for `PUT /api/client-match-profiles/:clientId` — upserts the client's weight overrides. */
export const saveMatchProfileSchema = z
  .object({
    weightSameClient: weight(),
    weightSameState: weight(),
    weightCredExact: weight(),
    weightCredPartial: weight(),
    weightRespondedHot: weight(),
    weightOutreach: weight(),
    weightSourced: weight(),
    penaltyCold: weight(),
    minScore: z.number().int().min(0).max(300),
  })
  .strict();
export type SaveMatchProfileInput = z.infer<typeof saveMatchProfileSchema>;

/** Body for `POST /api/roles/parse-jd` — paste a job description, AI extracts the role fields. */
export const parseJdSchema = z
  .object({
    text: z.string().trim().min(10).max(20000),
  })
  .strict();
export type ParseJdInput = z.infer<typeof parseJdSchema>;
/** What the AI extracts from a pasted JD (every field editable client-side before save). */
export interface ParsedJdDTO {
  title: string | null;
  credential: string | null;
  state: string | null;
  city: string | null;
  setting: string | null;
  population: string | null;
  rate: string | null;
  priority: RolePriority;
  description: string | null;
}

/** Body for `POST /api/roles/:id/promote` — fill this role from a matched lead. */
export const promoteFromMatchSchema = z
  .object({
    leadId: z.string().min(1),
  })
  .strict();
export type PromoteFromMatchInput = z.infer<typeof promoteFromMatchSchema>;

// --- Read DTOs ---

export interface RoleNoteDTO {
  id: string;
  body: string;
  category: string;
  authorId: string;
  authorName: string | null;
  createdAt: string; // ISO
}

export interface OpenRoleListItemDTO {
  id: string;
  clientId: string;
  clientName: string;
  title: string;
  credential: string | null;
  state: string | null;
  city: string | null;
  setting: string | null;
  population: string | null;
  rate: string | null;
  status: RoleStatus;
  priority: RolePriority;
  assignedToId: string | null;
  assignedToName: string | null;
  openedAt: string; // ISO
  closedAt: string | null; // ISO
  createdAt: string; // ISO
}

export interface OpenRoleDetailDTO extends OpenRoleListItemDTO {
  description: string | null;
  notes: RoleNoteDTO[];
}

/** One OFFSET page of the `/roles` browse list. */
export interface OpenRoleListDTO extends PageMeta {
  roles: OpenRoleListItemDTO[];
}

/** One scored lead against a role, ready to render (matcher OR dormant scorer). */
export interface RoleMatchDTO {
  leadId: string;
  leadName: string;
  leadStatus: LeadStatus;
  leadState: string | null;
  leadCredential: string | null;
  score: number;
}

export interface TriageRoleDTO {
  roleId: string;
  title: string;
  clientName: string;
  priority: RolePriority;
  status: RoleStatus;
  daysOpen: number;
  score: number;
  badge: TriageBadge;
  strongMatches: number;
  hotMatches: number;
}

export interface ClientMatchProfileDTO {
  clientId: string;
  weightSameClient: number;
  weightSameState: number;
  weightCredExact: number;
  weightCredPartial: number;
  weightRespondedHot: number;
  weightOutreach: number;
  weightSourced: number;
  penaltyCold: number;
  minScore: number;
  /** True when this client has no saved row — the response is `DEFAULT_MATCH_WEIGHTS`, not a real row. */
  isDefault: boolean;
}
