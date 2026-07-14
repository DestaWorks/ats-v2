import "server-only";
import { hasCapability } from "@/lib/constants";
import type { LeadStatus, RolePriority, RoleStatus } from "@/lib/constants";
import {
  DEFAULT_MATCH_WEIGHTS,
  dormantMatchesForRole,
  isStrongMatch,
  matchesForRole,
  triageScore,
  type ClientMatchWeights,
  type RuleLead,
} from "@/lib/rules";
import type {
  AddRoleNoteInput,
  ClientMatchProfileDTO,
  CreateOpenRoleInput,
  OpenRoleDetailDTO,
  OpenRoleListItemDTO,
  ParseJdInput,
  ParsedJdDTO,
  PromoteFromMatchInput,
  RoleMatchDTO,
  RoleNoteDTO,
  SaveMatchProfileInput,
  TriageRoleDTO,
  UpdateOpenRoleInput,
} from "@/lib/validation/open-role";
import { toIso, isoOrNull } from "@/lib/utils/iso";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { extractJd } from "@/server/ai/extract-jd";
import { openRoleRepository, type OpenRoleRow } from "@/server/repositories/open-role.repository";
import { clientMatchProfileRepository } from "@/server/repositories/client-match-profile.repository";
import { clientRepository } from "@/server/repositories/client.repository";
import { leadRepository, type LeadRow } from "@/server/repositories/lead.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";
import { leadService } from "./lead.service";

/** One OFFSET page of the `/roles` list (matches the candidates/leads list page size). */
const LIST_PAGE = 25;
/** Leadership-only: tuning a client's matcher weights is a scoring-config action, not day-to-day use. */
const MATCH_PROFILE_CAP = "viewReports" as const;

export interface OpenRoleListFilters {
  clientId?: string;
  status?: string;
  priority?: string;
  search?: string;
  page?: number;
}

function toRoleListItem(
  row: OpenRoleRow,
  clientNames: Map<string, string>,
  userNames: Map<string, string>,
): OpenRoleListItemDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: clientNames.get(row.clientId) ?? "Unknown client",
    title: row.title,
    credential: row.credential,
    state: row.state,
    city: row.city,
    setting: row.setting,
    population: row.population,
    rate: row.rate,
    status: row.status as RoleStatus,
    priority: row.priority as RolePriority,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedToId ? (userNames.get(row.assignedToId) ?? null) : null,
    openedAt: toIso(row.openedAt),
    closedAt: isoOrNull(row.closedAt),
    createdAt: toIso(row.createdAt),
  };
}

function toRoleNoteDTO(row: {
  id: string;
  body: string;
  category: string;
  authorId: string;
  authorName: string | null;
  createdAt: Date;
}): RoleNoteDTO {
  return {
    id: row.id,
    body: row.body,
    category: row.category,
    authorId: row.authorId,
    authorName: row.authorName,
    createdAt: toIso(row.createdAt),
  };
}

/** Load a live role or throw NOT_FOUND. */
async function requireRole(id: string): Promise<OpenRoleRow> {
  const role = await openRoleRepository.findById(id);
  if (!role) throw new AppError("NOT_FOUND", "Role not found");
  return role;
}

/** Project a lead row onto the pure matcher's input shape. */
function toRuleLead(lead: LeadRow): RuleLead {
  return {
    targetClientId: lead.clientId,
    state: lead.state,
    credential: lead.credential,
    status: lead.status as LeadStatus,
  };
}

function toMatchDTO(m: { lead: LeadRow & RuleLead; score: number }): RoleMatchDTO {
  return {
    leadId: m.lead.id,
    leadName: m.lead.name,
    leadStatus: m.lead.status as LeadStatus,
    leadState: m.lead.state,
    leadCredential: m.lead.credential,
    score: m.score,
  };
}

function toProfileDTO(
  clientId: string,
  row: ClientMatchWeights,
  isDefault: boolean,
): ClientMatchProfileDTO {
  return { clientId, ...row, isDefault };
}

/**
 * Open Roles business logic (Wave 3.5). Owns authZ + DTO shapes + the matching/triage pipeline;
 * never touches Prisma directly. AUTHZ: role CRUD/notes/matches/promote are open to any signed-in
 * operator (L-7, matches candidates/leads); ONLY the per-client matcher-weight profile is gated on
 * `viewReports` (leadership) since it retunes scoring for every recruiter working that client.
 */
export const openRoleService = {
  async create(input: CreateOpenRoleInput, user: AuthUser): Promise<OpenRoleDetailDTO> {
    const role = await withTransaction(async (tx) => {
      const created = await openRoleRepository.create(
        {
          clientId: input.clientId,
          title: input.title,
          credential: input.credential ?? null,
          state: input.state ?? null,
          city: input.city ?? null,
          setting: input.setting ?? null,
          population: input.population ?? null,
          rate: input.rate ?? null,
          description: input.description ?? null,
          priority: input.priority,
          createdById: user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: created.id,
        actor: user.id,
        action: "create",
        after: { title: created.title, clientId: created.clientId, priority: created.priority },
      });
      return created;
    });
    return this.detail(role.id);
  },

  async list(filters: OpenRoleListFilters = {}): Promise<{
    roles: OpenRoleListItemDTO[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    hasPrev: boolean;
    hasNext: boolean;
  }> {
    const repoFilters = {
      clientId: filters.clientId,
      status: filters.status,
      priority: filters.priority,
      search: filters.search,
    };
    const [total, clients] = await Promise.all([
      openRoleRepository.count(repoFilters),
      clientRepository.list(),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / LIST_PAGE));
    const page = Math.min(Math.max(1, filters.page ?? 1), totalPages);
    const rows = await openRoleRepository.list({
      ...repoFilters,
      skip: (page - 1) * LIST_PAGE,
      take: LIST_PAGE,
    });
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const userNames = await userRepository.namesByIds(
      rows.map((r) => r.assignedToId).filter((id): id is string => id !== null),
    );
    return {
      roles: rows.map((row) => toRoleListItem(row, clientNames, userNames)),
      total,
      page,
      pageSize: LIST_PAGE,
      totalPages,
      hasPrev: page > 1,
      hasNext: page < totalPages,
    };
  },

  /** Full detail — role + notes (matches/dormant matches are separate reads, `matches`/`dormantMatches`). */
  async detail(id: string): Promise<OpenRoleDetailDTO> {
    const role = await requireRole(id);
    const [notes, clients] = await Promise.all([
      openRoleRepository.listNotes(id),
      clientRepository.list(),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const authorIds = notes.map((n) => n.authorId);
    const assigneeIds = role.assignedToId ? [role.assignedToId] : [];
    const userNames = await userRepository.namesByIds([...authorIds, ...assigneeIds]);

    return {
      ...toRoleListItem(role, clientNames, userNames),
      description: role.description,
      notes: notes.map((n) =>
        toRoleNoteDTO({ ...n, authorName: n.authorName ?? userNames.get(n.authorId) ?? null }),
      ),
    };
  },

  /** The active matcher's ranked leads for this role (client-tunable weights, top 15). */
  async matches(id: string): Promise<RoleMatchDTO[]> {
    const role = await requireRole(id);
    const [leads, profileRow] = await Promise.all([
      leadRepository.list({}),
      clientMatchProfileRepository.findByClientId(role.clientId),
    ]);
    const weights = profileRow ?? DEFAULT_MATCH_WEIGHTS;
    const candidates = leads.map((lead) => ({ ...lead, ...toRuleLead(lead) }));
    return matchesForRole(role, candidates, weights).map(toMatchDTO);
  },

  /** The fixed-weight dormant re-engagement scorer's ranked leads for this role (top 10). */
  async dormantMatches(id: string): Promise<RoleMatchDTO[]> {
    const role = await requireRole(id);
    const leads = await leadRepository.list({});
    const candidates = leads.map((lead) => ({ ...lead, ...toRuleLead(lead) }));
    return dormantMatchesForRole(role, candidates).map(toMatchDTO);
  },

  async update(id: string, input: UpdateOpenRoleInput, user: AuthUser): Promise<OpenRoleDetailDTO> {
    const existing = await requireRole(id);
    const closingNow =
      input.status !== undefined &&
      (input.status === "Filled" || input.status === "Closed") &&
      existing.status !== "Filled" &&
      existing.status !== "Closed";
    const reopeningNow =
      input.status !== undefined &&
      input.status !== "Filled" &&
      input.status !== "Closed" &&
      (existing.status === "Filled" || existing.status === "Closed");

    await withTransaction(async (tx) => {
      const updated = await openRoleRepository.update(
        id,
        {
          ...input,
          ...(closingNow ? { closedAt: new Date() } : {}),
          ...(reopeningNow ? { closedAt: null } : {}),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: user.id,
        action: "update",
        before: { status: existing.status, priority: existing.priority },
        after: { status: updated.status, priority: updated.priority },
      });
    });
    return this.detail(id);
  },

  /** Hard delete (legacy `open_role_delete` parity — no undo). */
  async remove(id: string, user: AuthUser): Promise<{ id: string }> {
    const existing = await requireRole(id);
    await withTransaction(async (tx) => {
      await openRoleRepository.delete(id, tx);
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: user.id,
        action: "delete",
        before: { title: existing.title, clientId: existing.clientId },
      });
    });
    return { id };
  },

  async addNote(id: string, input: AddRoleNoteInput, user: AuthUser): Promise<OpenRoleDetailDTO> {
    await requireRole(id);
    await withTransaction(async (tx) => {
      const note = await openRoleRepository.createNote(
        {
          roleId: id,
          authorId: user.id,
          authorName: user.name,
          body: input.body,
          category: input.category,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: user.id,
        action: "add_note",
        after: { noteId: note.id, category: input.category },
      });
    });
    return this.detail(id);
  },

  async deleteNote(id: string, noteId: string, user: AuthUser): Promise<OpenRoleDetailDTO> {
    await requireRole(id);
    await withTransaction(async (tx) => {
      const { count } = await openRoleRepository.softDeleteNote(noteId, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Note not found");
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: user.id,
        action: "delete_note",
        after: { noteId },
      });
    });
    return this.detail(id);
  },

  /**
   * Fill this role from a matched lead — promotes the lead into the candidate pipeline (reusing
   * `leadService.promote`'s full lifecycle: create candidate, flip lead to Promoted, audit) and
   * stamps the new candidate's `filledFromRoleId`. Legacy has NO automatic role-status flip on
   * promote (confirmed in the audit) — the recruiter marks the role Filled separately via `update`.
   */
  async promote(
    id: string,
    input: PromoteFromMatchInput,
    user: AuthUser,
  ): Promise<{ candidateId: string }> {
    await requireRole(id);
    return leadService.promote(input.leadId, user, { filledFromRoleId: id });
  },

  /** Top 3 "roles to work now" across every active (non-Filled/Closed) role. */
  async triage(): Promise<TriageRoleDTO[]> {
    const [roles, clients, leads, profiles] = await Promise.all([
      openRoleRepository.listActive(),
      clientRepository.list(),
      leadRepository.list({}),
      clientMatchProfileRepository.list(),
    ]);
    const clientNames = new Map(clients.map((c) => [c.id, c.name]));
    const profileByClient = new Map(profiles.map((p) => [p.clientId, p]));
    const candidates = leads.map((lead) => ({ ...lead, ...toRuleLead(lead) }));
    const now = new Date();

    const scored = roles.map((role) => {
      const weights = profileByClient.get(role.clientId) ?? DEFAULT_MATCH_WEIGHTS;
      const roleMatches = matchesForRole(role, candidates, weights);
      const strongMatches = roleMatches.filter((m) => isStrongMatch(m.score)).length;
      const hotMatches = roleMatches.filter((m) => m.lead.status === "Responded — Hot").length;
      const result = triageScore(
        {
          status: role.status as RoleStatus,
          priority: role.priority as RolePriority,
          openedAt: role.openedAt,
        },
        strongMatches,
        hotMatches,
        now,
      );
      const dto: TriageRoleDTO = {
        roleId: role.id,
        title: role.title,
        clientName: clientNames.get(role.clientId) ?? "Unknown client",
        priority: role.priority as RolePriority,
        status: role.status as RoleStatus,
        daysOpen: result.daysOpen,
        score: result.score,
        badge: result.badge,
        strongMatches,
        hotMatches,
      };
      return dto;
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, 3);
  },

  /** This client's matcher-weight profile, or the system default (flagged `isDefault`). */
  async getMatchProfile(clientId: string): Promise<ClientMatchProfileDTO> {
    const row = await clientMatchProfileRepository.findByClientId(clientId);
    if (!row) return toProfileDTO(clientId, DEFAULT_MATCH_WEIGHTS, true);
    return toProfileDTO(clientId, row, false);
  },

  /** Leadership-only: retune a client's active-matcher weights (upsert-on-save, legacy `cp_save`). */
  async saveMatchProfile(
    clientId: string,
    input: SaveMatchProfileInput,
    user: AuthUser,
  ): Promise<ClientMatchProfileDTO> {
    if (!hasCapability(user.role, MATCH_PROFILE_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can retune client matching weights");
    }
    const row = await withTransaction(async (tx) => {
      const saved = await clientMatchProfileRepository.upsert(
        clientId,
        { ...input, updatedById: user.id },
        tx,
      );
      await writeAudit(tx, {
        entity: "client_match_profile",
        entityId: clientId,
        actor: user.id,
        action: "save",
        after: input,
      });
      return saved;
    });
    return toProfileDTO(clientId, row, false);
  },

  /** Leadership-only: reset a client to the system default weights. */
  async deleteMatchProfile(clientId: string, user: AuthUser): Promise<ClientMatchProfileDTO> {
    if (!hasCapability(user.role, MATCH_PROFILE_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can retune client matching weights");
    }
    const existing = await clientMatchProfileRepository.findByClientId(clientId);
    if (existing) {
      await withTransaction(async (tx) => {
        await clientMatchProfileRepository.delete(clientId, tx);
        await writeAudit(tx, {
          entity: "client_match_profile",
          entityId: clientId,
          actor: user.id,
          action: "reset",
        });
      });
    }
    return toProfileDTO(clientId, DEFAULT_MATCH_WEIGHTS, true);
  },

  /** JD-paste-to-autofill (legacy `ats_parse_jd`). */
  async parseJd(input: ParseJdInput): Promise<ParsedJdDTO> {
    return extractJd(input.text);
  },
};
