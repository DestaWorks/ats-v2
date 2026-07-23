/**
 * Client CRM contract (Wave 4.2) — isomorphic types + zod shared by the `/crm` routes and client.
 * `priority`/`cadence` are free-vocab selects (starter lists, not DB enums — matches
 * `ROLE_NOTE_CATEGORIES`'s pattern), `role`/`status`/`type` on contacts/tasks/meetings are the
 * real small enums.
 */
import { z } from "zod";
import {
  CLIENT_TASK_STATUSES,
  CONTACT_ROLES,
  CONTACT_STATUSES,
  DEAL_STAGES,
  MEETING_TYPES,
} from "@/lib/constants";

// --- Client -------------------------------------------------------------

export interface ClientListItemDTO {
  id: string;
  name: string;
  capacity: number | null;
  priority: string | null;
  location: string | null;
  contact: string | null;
  renewalDate: string | null; // ISO
  contactCount: number;
}

/** The full client list — small, fixed set of accounts, no pagination (matches `clientRepository.list()`). */
export interface ClientListDTO {
  clients: ClientListItemDTO[];
}

export interface ClientProfileDTO {
  id: string;
  name: string;
  capacity: number | null;
  contact: string | null;
  location: string | null;
  priority: string | null;
  cadence: string | null;
  schedule: string | null;
  contractStart: string | null; // ISO
  renewalDate: string | null; // ISO
  states: string[];
  specialties: string[];
  services: string[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface ClientPipelineSnapshotDTO {
  total: number;
  active: number;
  started: number;
  verified: number;
}

export interface ClientDetailDTO {
  client: ClientProfileDTO;
  contacts: ClientContactDTO[];
  pipelineSnapshot: ClientPipelineSnapshotDTO;
  tasks: ClientTaskDTO[];
  meetings: ClientMeetingDTO[];
  deals: DealDTO[];
  /** Newest-first combined feed, capped at 40 — legacy's Timeline tab is unbounded; this isn't. */
  timeline: ClientTimelineEntryDTO[];
}

export const createClientSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    capacity: z.number().int().min(0).max(10_000).nullish(),
    contact: z.string().trim().max(200).nullish(),
    location: z.string().trim().max(200).nullish(),
    priority: z.string().trim().max(40).nullish(),
    cadence: z.string().trim().max(40).nullish(),
    schedule: z.string().trim().max(200).nullish(),
    contractStart: z.coerce.date().nullish(),
    renewalDate: z.coerce.date().nullish(),
    states: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
    specialties: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
    services: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
  })
  .strict();
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema
  .omit({ name: true })
  .extend({ name: z.string().trim().min(1).max(200).optional() })
  .strict();
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// --- Client contact -------------------------------------------------------

export interface ClientContactDTO {
  id: string;
  clientId: string;
  fullName: string;
  title: string | null;
  role: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  reportsTo: string | null;
  status: string;
  notes: string | null;
  addedById: string | null;
  addedByName: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const addContactSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200),
    title: z.string().trim().max(120).nullish(),
    role: z.enum(CONTACT_ROLES).default("unknown"),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    linkedin: z.string().trim().url().max(500).nullish(),
    reportsTo: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(4000).nullish(),
  })
  .strict();
export type AddContactInput = z.infer<typeof addContactSchema>;

export const updateContactSchema = z
  .object({
    fullName: z.string().trim().min(1).max(200).optional(),
    title: z.string().trim().max(120).nullish(),
    role: z.enum(CONTACT_ROLES).optional(),
    email: z.string().trim().email().max(200).nullish(),
    phone: z.string().trim().max(50).nullish(),
    linkedin: z.string().trim().url().max(500).nullish(),
    reportsTo: z.string().trim().max(200).nullish(),
    status: z.enum(CONTACT_STATUSES).optional(),
    notes: z.string().trim().max(4000).nullish(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateContactInput = z.infer<typeof updateContactSchema>;

// --- Client task (Wave 4.2 slice 2) ----------------------------------------

export interface ClientTaskDTO {
  id: string;
  clientId: string;
  title: string;
  dueDate: string | null; // ISO
  assignedToId: string | null;
  status: string;
  completedAt: string | null; // ISO
  createdById: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export const addTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    dueDate: z.coerce.date().nullish(),
    assignedToId: z.string().trim().min(1).max(200).nullish(),
  })
  .strict();
export type AddTaskInput = z.infer<typeof addTaskSchema>;

/** Setting `status: "done"` stamps `completedAt` server-side; `"open"` clears it — see `client.service.ts`. */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    dueDate: z.coerce.date().nullish(),
    assignedToId: z.string().trim().min(1).max(200).nullish(),
    status: z.enum(CLIENT_TASK_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// --- Client meeting (Wave 4.2 slice 2) -------------------------------------

export interface ClientMeetingDTO {
  id: string;
  clientId: string;
  type: string;
  attendees: string | null;
  notes: string | null;
  actionItems: string | null;
  loggedById: string | null;
  createdAt: string; // ISO
}

export const addMeetingSchema = z
  .object({
    type: z.enum(MEETING_TYPES),
    attendees: z.string().trim().max(500).nullish(),
    notes: z.string().trim().max(4000).nullish(),
    actionItems: z.string().trim().max(4000).nullish(),
  })
  .strict();
export type AddMeetingInput = z.infer<typeof addMeetingSchema>;

// --- Deal (Wave 4.2 slice 3) ------------------------------------------------

export interface DealBlockerDTO {
  id: string;
  dealId: string;
  text: string;
  resolved: boolean;
  resolvedAt: string | null; // ISO
  createdAt: string; // ISO
}

export interface DealDTO {
  id: string;
  clientId: string;
  name: string;
  stage: string;
  estValue: number | null;
  expectedCloseDate: string | null; // ISO
  probabilityOverride: number | null;
  closedAt: string | null; // ISO
  closeReason: string | null;
  postMortem: string | null;
  createdById: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  blockers: DealBlockerDTO[];
}

export const createDealSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    estValue: z.number().int().min(0).max(100_000_000).nullish(),
    expectedCloseDate: z.coerce.date().nullish(),
    probabilityOverride: z.number().int().min(0).max(100).nullish(),
  })
  .strict();
export type CreateDealInput = z.infer<typeof createDealSchema>;

/**
 * Moving a kanban card is `{stage}`; closing is `{stage: "Signed"|"Lost", closeReason?,
 * postMortem?}` through this SAME endpoint — the service stamps/clears `closedAt` based on the
 * stage transition (mirrors `updateTaskSchema`'s `status`→`completedAt` pattern exactly).
 */
export const updateDealSchema = z
  .object({
    name: z.string().trim().min(1).max(300).optional(),
    stage: z.enum(DEAL_STAGES).optional(),
    estValue: z.number().int().min(0).max(100_000_000).nullish(),
    expectedCloseDate: z.coerce.date().nullish(),
    probabilityOverride: z.number().int().min(0).max(100).nullish(),
    closeReason: z.string().trim().max(2000).nullish(),
    postMortem: z.string().trim().max(4000).nullish(),
  })
  .strict()
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: "Provide at least one field to update",
  });
export type UpdateDealInput = z.infer<typeof updateDealSchema>;

export const addBlockerSchema = z.object({ text: z.string().trim().min(1).max(2000) }).strict();
export type AddBlockerInput = z.infer<typeof addBlockerSchema>;

/** Stamps/clears `resolvedAt` server-side based on the `resolved` transition. */
export const updateBlockerSchema = z.object({ resolved: z.boolean() }).strict();
export type UpdateBlockerInput = z.infer<typeof updateBlockerSchema>;

// --- Timeline (Wave 4.2 slice 2-3) — read-time aggregation, no schema/route of its own -------

export type ClientTimelineEntryKind =
  | "client_created"
  | "contact_added"
  | "task_created"
  | "task_completed"
  | "meeting_logged"
  | "deal_created"
  | "deal_closed";

export interface ClientTimelineEntryDTO {
  kind: ClientTimelineEntryKind;
  at: string; // ISO
  summary: string;
}
