import { hasCapability } from "@destaworks/domain/constants";
import type { LeadStatus, RolePriority, RoleStatus } from "@destaworks/domain/constants";
import {
  DEFAULT_MATCH_WEIGHTS,
  dormantMatchesForRole,
  isStrongMatch,
  matchesForRole,
  triageScore,
  type ClientMatchWeights,
  type RuleLead,
} from "@destaworks/domain/rules";
import type {
  AddRoleNoteInput,
  ClientMatchProfileDTO,
  CreateOpenRoleInput,
  OpenRoleDetailDTO,
  OpenRoleListDTO,
  OpenRoleListItemDTO,
  ParseJdInput,
  ParsedJdDTO,
  PromoteFromMatchInput,
  RoleMatchDTO,
  RoleNoteDTO,
  SaveMatchProfileInput,
  TriageRoleDTO,
  UpdateOpenRoleInput,
} from "@destaworks/contracts/validation/open-role";
import { toIso, isoOrNull } from "@destaworks/domain/utils/iso";
import { defined } from "@destaworks/domain/utils/defined";
import { pageMeta } from "@destaworks/domain/pagination";
import type { TenantContext } from "@destaworks/domain/tenant";
import { writeAudit } from "@destaworks/db/audit";
import { withTenantTransaction } from "@destaworks/db/with-transaction";
import { extractJd } from "@destaworks/integrations/ai/extract-jd";
import {
  openRoleRepository,
  type OpenRoleRow,
} from "@destaworks/db/repositories/open-role.repository";
import { clientMatchProfileRepository } from "@destaworks/db/repositories/client-match-profile.repository";
import { leadRepository, type LeadMatchRow } from "@destaworks/db/repositories/lead.repository";
import { userRepository } from "@destaworks/db/repositories/user.repository";
import { AppError } from "@destaworks/integrations/http/app-error";
import { leadService } from "./lead.service";
import { cachedClientNameMap } from "@destaworks/integrations/http/request-cache";

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
async function requireRole(ctx: TenantContext, id: string): Promise<OpenRoleRow> {
  const role = await openRoleRepository.findById(ctx, id);
  if (!role) throw new AppError("NOT_FOUND", "Role not found");
  return role;
}

/** Project a lead row onto the pure matcher's input shape. */
function toRuleLead(lead: LeadMatchRow): RuleLead {
  return {
    targetClientId: lead.clientId,
    state: lead.state,
    credential: lead.credential,
    status: lead.status as LeadStatus,
  };
}

function toMatchDTO(m: { lead: LeadMatchRow & RuleLead; score: number }): RoleMatchDTO {
  return {
    leadId: m.lead.id,
    leadName: m.lead.name,
    leadStatus: m.lead.status as LeadStatus,
    leadState: m.lead.state,
    leadCredential: m.lead.credential,
    score: m.score,
  };
}

/** Every non-deleted lead, projected onto the matchers' input shape (one lean query). */
async function loadMatchCandidates(ctx: TenantContext): Promise<Array<LeadMatchRow & RuleLead>> {
  const leads = await leadRepository.listForMatching(ctx);
  return leads.map((lead) => ({ ...lead, ...toRuleLead(lead) }));
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
  async create(input: CreateOpenRoleInput, ctx: TenantContext): Promise<OpenRoleDetailDTO> {
    const role = await withTenantTransaction(ctx, async (tx) => {
      const created = await openRoleRepository.create(
        ctx,
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
          createdById: ctx.user.id,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: created.id,
        actor: ctx.user.id,
        action: "create",
        after: { title: created.title, clientId: created.clientId, priority: created.priority },
      });
      return created;
    });
    return this.detail(role.id, ctx);
  },

  async list(filters: OpenRoleListFilters, ctx: TenantContext): Promise<OpenRoleListDTO> {
    const repoFilters = defined({
      clientId: filters.clientId,
      status: filters.status,
      priority: filters.priority,
      search: filters.search,
    });
    const [total, clientNames] = await Promise.all([
      openRoleRepository.count(ctx, repoFilters),
      cachedClientNameMap(),
    ]);
    const meta = pageMeta(total, filters.page ?? 1, LIST_PAGE);
    const rows = await openRoleRepository.list(ctx, {
      ...repoFilters,
      skip: (meta.page - 1) * LIST_PAGE,
      take: LIST_PAGE,
    });
    const userNames = await userRepository.namesByIds(
      rows.map((r) => r.assignedToId).filter((id): id is string => id !== null),
    );
    return { roles: rows.map((row) => toRoleListItem(row, clientNames, userNames)), ...meta };
  },

  /** Full detail — role + notes (matches/dormant matches are separate reads, `matches`/`dormantMatches`). */
  async detail(id: string, ctx: TenantContext): Promise<OpenRoleDetailDTO> {
    const role = await requireRole(ctx, id);
    const [notes, clientNames] = await Promise.all([
      openRoleRepository.listNotes(ctx, id),
      cachedClientNameMap(),
    ]);
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
  async matches(id: string, ctx: TenantContext): Promise<RoleMatchDTO[]> {
    const role = await requireRole(ctx, id);
    const [candidates, profileRow] = await Promise.all([
      loadMatchCandidates(ctx),
      clientMatchProfileRepository.findByClientId(ctx, role.clientId),
    ]);
    const weights = profileRow ?? DEFAULT_MATCH_WEIGHTS;
    return matchesForRole(role, candidates, weights).map(toMatchDTO);
  },

  /** The fixed-weight dormant re-engagement scorer's ranked leads for this role (top 10). */
  async dormantMatches(id: string, ctx: TenantContext): Promise<RoleMatchDTO[]> {
    const role = await requireRole(ctx, id);
    const candidates = await loadMatchCandidates(ctx);
    return dormantMatchesForRole(role, candidates).map(toMatchDTO);
  },

  /**
   * `matches` + `dormantMatches` computed from ONE lead fetch — for `/roles/[id]`, which needs
   * both on the same page load (avoids two redundant full-table scans of `source_lead`).
   */
  async matchesAndDormant(
    id: string,
    ctx: TenantContext,
  ): Promise<{ matches: RoleMatchDTO[]; dormantMatches: RoleMatchDTO[] }> {
    const role = await requireRole(ctx, id);
    const [candidates, profileRow] = await Promise.all([
      loadMatchCandidates(ctx),
      clientMatchProfileRepository.findByClientId(ctx, role.clientId),
    ]);
    const weights = profileRow ?? DEFAULT_MATCH_WEIGHTS;
    return {
      matches: matchesForRole(role, candidates, weights).map(toMatchDTO),
      dormantMatches: dormantMatchesForRole(role, candidates).map(toMatchDTO),
    };
  },

  async update(
    id: string,
    input: UpdateOpenRoleInput,
    ctx: TenantContext,
  ): Promise<OpenRoleDetailDTO> {
    const existing = await requireRole(ctx, id);
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

    await withTenantTransaction(ctx, async (tx) => {
      const updated = await openRoleRepository.update(
        ctx,
        id,
        {
          ...defined(input),
          ...(closingNow ? { closedAt: new Date() } : {}),
          ...(reopeningNow ? { closedAt: null } : {}),
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: ctx.user.id,
        action: "update",
        before: { status: existing.status, priority: existing.priority },
        after: { status: updated.status, priority: updated.priority },
      });
    });
    return this.detail(id, ctx);
  },

  /** Hard delete (legacy `open_role_delete` parity — no undo). */
  async remove(id: string, ctx: TenantContext): Promise<{ id: string }> {
    const existing = await requireRole(ctx, id);
    await withTenantTransaction(ctx, async (tx) => {
      await openRoleRepository.delete(ctx, id, tx);
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: ctx.user.id,
        action: "delete",
        before: { title: existing.title, clientId: existing.clientId },
      });
    });
    return { id };
  },

  async addNote(
    id: string,
    input: AddRoleNoteInput,
    ctx: TenantContext,
  ): Promise<OpenRoleDetailDTO> {
    await requireRole(ctx, id);
    await withTenantTransaction(ctx, async (tx) => {
      const note = await openRoleRepository.createNote(
        ctx,
        {
          roleId: id,
          authorId: ctx.user.id,
          authorName: ctx.user.name,
          body: input.body,
          category: input.category,
        },
        tx,
      );
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: ctx.user.id,
        action: "add_note",
        after: { noteId: note.id, category: input.category },
      });
    });
    return this.detail(id, ctx);
  },

  async deleteNote(id: string, noteId: string, ctx: TenantContext): Promise<OpenRoleDetailDTO> {
    await requireRole(ctx, id);
    await withTenantTransaction(ctx, async (tx) => {
      const { count } = await openRoleRepository.softDeleteNote(ctx, noteId, id, ctx.user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Note not found");
      await writeAudit(tx, {
        entity: "open_role",
        entityId: id,
        actor: ctx.user.id,
        action: "delete_note",
        after: { noteId },
      });
    });
    return this.detail(id, ctx);
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
    ctx: TenantContext,
  ): Promise<{ candidateId: string }> {
    await requireRole(ctx, id);
    return leadService.promote(input.leadId, ctx, { filledFromRoleId: id });
  },

  /** Top 3 "roles to work now" across every active (non-Filled/Closed) role. */
  async triage(ctx: TenantContext): Promise<TriageRoleDTO[]> {
    const [roles, clientNames, candidates, profiles] = await Promise.all([
      openRoleRepository.listActive(ctx),
      cachedClientNameMap(),
      loadMatchCandidates(ctx),
      clientMatchProfileRepository.list(ctx),
    ]);
    const profileByClient = new Map(profiles.map((p) => [p.clientId, p]));
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
  async getMatchProfile(clientId: string, ctx: TenantContext): Promise<ClientMatchProfileDTO> {
    const row = await clientMatchProfileRepository.findByClientId(ctx, clientId);
    if (!row) return toProfileDTO(clientId, DEFAULT_MATCH_WEIGHTS, true);
    return toProfileDTO(clientId, row, false);
  },

  /** Leadership-only: retune a client's active-matcher weights (upsert-on-save, legacy `cp_save`). */
  async saveMatchProfile(
    clientId: string,
    input: SaveMatchProfileInput,
    ctx: TenantContext,
  ): Promise<ClientMatchProfileDTO> {
    if (!hasCapability(ctx.role, MATCH_PROFILE_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can retune client matching weights");
    }
    const row = await withTenantTransaction(ctx, async (tx) => {
      const saved = await clientMatchProfileRepository.upsert(
        ctx,
        clientId,
        { ...input, updatedById: ctx.user.id },
        tx,
      );
      await writeAudit(tx, {
        entity: "client_match_profile",
        entityId: clientId,
        actor: ctx.user.id,
        action: "save",
        after: input,
      });
      return saved;
    });
    return toProfileDTO(clientId, row, false);
  },

  /** Leadership-only: reset a client to the system default weights. */
  async deleteMatchProfile(clientId: string, ctx: TenantContext): Promise<ClientMatchProfileDTO> {
    if (!hasCapability(ctx.role, MATCH_PROFILE_CAP)) {
      throw new AppError("FORBIDDEN", "Only leadership can retune client matching weights");
    }
    const existing = await clientMatchProfileRepository.findByClientId(ctx, clientId);
    if (existing) {
      await withTenantTransaction(ctx, async (tx) => {
        await clientMatchProfileRepository.delete(ctx, clientId, tx);
        await writeAudit(tx, {
          entity: "client_match_profile",
          entityId: clientId,
          actor: ctx.user.id,
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
