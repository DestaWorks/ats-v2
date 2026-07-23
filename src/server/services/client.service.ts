import "server-only";
import { isClosedDealStage, statusOrder, type CandidateStatus } from "@/lib/constants";
import type {
  AddBlockerInput,
  AddContactInput,
  AddMeetingInput,
  AddTaskInput,
  ClientContactDTO,
  ClientDetailDTO,
  ClientListDTO,
  ClientListItemDTO,
  ClientMeetingDTO,
  ClientPipelineSnapshotDTO,
  ClientProfileDTO,
  ClientTaskDTO,
  ClientTimelineEntryDTO,
  CreateClientInput,
  CreateDealInput,
  DealBlockerDTO,
  DealDTO,
  UpdateBlockerInput,
  UpdateClientInput,
  UpdateContactInput,
  UpdateDealInput,
  UpdateTaskInput,
} from "@/lib/validation/client";
import { toIso, isoOrNull } from "@/lib/utils/iso";
import type { AuthUser } from "@/server/auth/guards";
import { writeAudit } from "@/server/db/audit";
import { withTransaction } from "@/server/db/with-transaction";
import { clientRepository, type ClientRow } from "@/server/repositories/client.repository";
import {
  clientContactRepository,
  type ClientContactRow,
} from "@/server/repositories/client-contact.repository";
import {
  clientTaskRepository,
  type ClientTaskRow,
} from "@/server/repositories/client-task.repository";
import {
  clientMeetingRepository,
  type ClientMeetingRow,
} from "@/server/repositories/client-meeting.repository";
import { dealRepository, type DealRow } from "@/server/repositories/deal.repository";
import {
  dealBlockerRepository,
  type DealBlockerRow,
} from "@/server/repositories/deal-blocker.repository";
import {
  candidateRepository,
  FIRST_TERMINAL_ORDER,
} from "@/server/repositories/candidate.repository";
import { userRepository } from "@/server/repositories/user.repository";
import { AppError } from "@/server/http/app-error";

/** Timeline is capped, newest first — legacy's equivalent tab has no cap at all. */
const TIMELINE_CAP = 40;

function toClientListItem(row: ClientRow, contactCounts: Map<string, number>): ClientListItemDTO {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    priority: row.priority,
    location: row.location,
    contact: row.contact,
    renewalDate: isoOrNull(row.renewalDate),
    contactCount: contactCounts.get(row.id) ?? 0,
  };
}

function toClientProfile(row: ClientRow): ClientProfileDTO {
  return {
    id: row.id,
    name: row.name,
    capacity: row.capacity,
    contact: row.contact,
    location: row.location,
    priority: row.priority,
    cadence: row.cadence,
    schedule: row.schedule,
    contractStart: isoOrNull(row.contractStart),
    renewalDate: isoOrNull(row.renewalDate),
    states: row.states,
    specialties: row.specialties,
    services: row.services,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toContactDTO(row: ClientContactRow, userNames: Map<string, string>): ClientContactDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    fullName: row.fullName,
    title: row.title,
    role: row.role,
    email: row.email,
    phone: row.phone,
    linkedin: row.linkedin,
    reportsTo: row.reportsTo,
    status: row.status,
    notes: row.notes,
    addedById: row.addedById,
    addedByName: row.addedById ? (userNames.get(row.addedById) ?? null) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toTaskDTO(row: ClientTaskRow): ClientTaskDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    title: row.title,
    dueDate: isoOrNull(row.dueDate),
    assignedToId: row.assignedToId,
    status: row.status,
    completedAt: isoOrNull(row.completedAt),
    createdById: row.createdById,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toMeetingDTO(row: ClientMeetingRow): ClientMeetingDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    type: row.type,
    attendees: row.attendees,
    notes: row.notes,
    actionItems: row.actionItems,
    loggedById: row.loggedById,
    createdAt: toIso(row.createdAt),
  };
}

function toBlockerDTO(row: DealBlockerRow): DealBlockerDTO {
  return {
    id: row.id,
    dealId: row.dealId,
    text: row.text,
    resolved: row.resolved,
    resolvedAt: isoOrNull(row.resolvedAt),
    createdAt: toIso(row.createdAt),
  };
}

function toDealDTO(row: DealRow, blockers: DealBlockerRow[]): DealDTO {
  return {
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    stage: row.stage,
    estValue: row.estValue,
    expectedCloseDate: isoOrNull(row.expectedCloseDate),
    probabilityOverride: row.probabilityOverride,
    closedAt: isoOrNull(row.closedAt),
    closeReason: row.closeReason,
    postMortem: row.postMortem,
    createdById: row.createdById,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    blockers: blockers.map(toBlockerDTO),
  };
}

/**
 * Read-time aggregation — NOT a stored table, and NOT sourced from the generic `activity_log`
 * (its `entityId` is the mutated row's own id, not a `clientId`; cross-referencing every task/
 * contact id back to "which client" would be worse than just reading the three domain tables,
 * which already know their own `clientId`). Sorted newest-first, capped at `TIMELINE_CAP`.
 */
function buildTimeline(
  client: ClientRow,
  contacts: ClientContactRow[],
  tasks: ClientTaskRow[],
  meetings: ClientMeetingRow[],
  deals: DealRow[],
): ClientTimelineEntryDTO[] {
  const entries: ClientTimelineEntryDTO[] = [
    { kind: "client_created", at: toIso(client.createdAt), summary: `${client.name} added` },
    ...contacts.map((c) => ({
      kind: "contact_added" as const,
      at: toIso(c.createdAt),
      summary: `${c.fullName} added as a contact`,
    })),
    ...tasks.map((t) => ({
      kind: "task_created" as const,
      at: toIso(t.createdAt),
      summary: `Task created: ${t.title}`,
    })),
    ...tasks
      .filter((t) => t.completedAt)
      .map((t) => ({
        kind: "task_completed" as const,
        at: toIso(t.completedAt!),
        summary: `Task completed: ${t.title}`,
      })),
    ...meetings.map((m) => ({
      kind: "meeting_logged" as const,
      at: toIso(m.createdAt),
      summary: `${m.type} meeting logged${m.attendees ? ` with ${m.attendees}` : ""}`,
    })),
    ...deals.map((d) => ({
      kind: "deal_created" as const,
      at: toIso(d.createdAt),
      summary: `Deal created: ${d.name}`,
    })),
    ...deals
      .filter((d) => d.closedAt)
      .map((d) => ({
        kind: "deal_closed" as const,
        at: toIso(d.closedAt!),
        summary: `Deal ${d.stage === "Signed" ? "won" : "lost"}: ${d.name}`,
      })),
  ];
  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return entries.slice(0, TIMELINE_CAP);
}

async function requireClient(id: string): Promise<ClientRow> {
  const client = await clientRepository.findById(id);
  if (!client) throw new AppError("NOT_FOUND", "Client not found");
  return client;
}

/**
 * Client CRM service (Wave 4.2, slice 1). AuthZ: `requireCapability("viewCrm")` runs at the
 * ROUTE/page boundary (matches `credentialsIntelligenceService`'s pattern — capability checks
 * aren't duplicated inside services in this codebase); every mutating method here still takes
 * the acting `AuthUser` for `writeAudit`/`addedById`.
 */
export const clientService = {
  async list(): Promise<ClientListDTO> {
    const [rows, contactCounts] = await Promise.all([
      clientRepository.list(),
      clientRepository.contactCounts(),
    ]);
    return { clients: rows.map((r) => toClientListItem(r, contactCounts)) };
  },

  async detail(id: string): Promise<ClientDetailDTO> {
    const client = await requireClient(id);
    const [contactRows, taskRows, meetingRows, dealRows, statusGroups, verified] =
      await Promise.all([
        clientContactRepository.listForClient(id),
        clientTaskRepository.listForClient(id),
        clientMeetingRepository.listForClient(id),
        dealRepository.listForClient(id),
        candidateRepository.groupByStatusFiltered({ clientId: id }),
        candidateRepository.count({ clientId: id, licenseStatus: "Active" }),
      ]);
    const [userNames, blockersByDeal] = await Promise.all([
      userRepository.namesByIds(
        contactRows.map((c) => c.addedById).filter((id): id is string => id != null),
      ),
      Promise.all(dealRows.map((d) => dealBlockerRepository.listForDeal(d.id))),
    ]);

    const total = statusGroups.reduce((sum, g) => sum + g._count._all, 0);
    const started = statusGroups.find((g) => g.status === "STARTED_DAY1")?._count._all ?? 0;
    const active = statusGroups
      .filter((g) => statusOrder(g.status as CandidateStatus) < FIRST_TERMINAL_ORDER)
      .reduce((sum, g) => sum + g._count._all, 0);
    const pipelineSnapshot: ClientPipelineSnapshotDTO = { total, active, started, verified };

    return {
      client: toClientProfile(client),
      contacts: contactRows.map((c) => toContactDTO(c, userNames)),
      tasks: taskRows.map(toTaskDTO),
      meetings: meetingRows.map(toMeetingDTO),
      deals: dealRows.map((d, i) => toDealDTO(d, blockersByDeal[i]!)),
      timeline: buildTimeline(client, contactRows, taskRows, meetingRows, dealRows),
      pipelineSnapshot,
    };
  },

  async create(input: CreateClientInput, user: AuthUser): Promise<ClientProfileDTO> {
    const created = await withTransaction(async (tx) => {
      const row = await clientRepository.create(input, tx);
      await writeAudit(tx, {
        entity: "client",
        entityId: row.id,
        actor: user.id,
        action: "create",
        after: { name: row.name },
      });
      return row;
    });
    return toClientProfile(created);
  },

  async update(id: string, input: UpdateClientInput, user: AuthUser): Promise<ClientProfileDTO> {
    const existing = await requireClient(id);
    const updated = await withTransaction(async (tx) => {
      const row = await clientRepository.update(id, input, tx);
      await writeAudit(tx, {
        entity: "client",
        entityId: id,
        actor: user.id,
        action: "update",
        before: { name: existing.name },
        after: { name: row.name },
      });
      return row;
    });
    return toClientProfile(updated);
  },

  async addContact(
    clientId: string,
    input: AddContactInput,
    user: AuthUser,
  ): Promise<ClientContactDTO> {
    await requireClient(clientId);
    const created = await withTransaction(async (tx) => {
      const row = await clientContactRepository.create(
        { ...input, clientId, addedById: user.id },
        tx,
      );
      await writeAudit(tx, {
        entity: "client_contact",
        entityId: row.id,
        actor: user.id,
        action: "add_contact",
        after: { clientId, fullName: row.fullName, role: row.role },
      });
      return row;
    });
    const userNames = await userRepository.namesByIds([user.id]);
    return toContactDTO(created, userNames);
  },

  async updateContact(
    clientId: string,
    contactId: string,
    input: UpdateContactInput,
    user: AuthUser,
  ): Promise<ClientContactDTO> {
    await requireClient(clientId);
    const updated = await withTransaction(async (tx) => {
      const count = await clientContactRepository.update(clientId, contactId, input, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Contact not found");
      const row = await clientContactRepository.findById(contactId, tx);
      if (!row) throw new AppError("NOT_FOUND", "Contact not found");
      await writeAudit(tx, {
        entity: "client_contact",
        entityId: contactId,
        actor: user.id,
        action: "update_contact",
        after: { clientId, ...input },
      });
      return row;
    });
    const userNames = await userRepository.namesByIds(updated.addedById ? [updated.addedById] : []);
    return toContactDTO(updated, userNames);
  },

  async removeContact(clientId: string, contactId: string, user: AuthUser): Promise<void> {
    await requireClient(clientId);
    await withTransaction(async (tx) => {
      const count = await clientContactRepository.softDelete(clientId, contactId, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Contact not found");
      await writeAudit(tx, {
        entity: "client_contact",
        entityId: contactId,
        actor: user.id,
        action: "remove_contact",
        after: { clientId },
      });
    });
  },

  // --- Tasks (Wave 4.2 slice 2) ------------------------------------------

  async addTask(clientId: string, input: AddTaskInput, user: AuthUser): Promise<ClientTaskDTO> {
    await requireClient(clientId);
    const created = await withTransaction(async (tx) => {
      const row = await clientTaskRepository.create(
        { ...input, clientId, createdById: user.id },
        tx,
      );
      await writeAudit(tx, {
        entity: "client_task",
        entityId: row.id,
        actor: user.id,
        action: "add_task",
        after: { clientId, title: row.title },
      });
      return row;
    });
    return toTaskDTO(created);
  },

  /**
   * A `status: "done"` transition stamps `completedAt`; `"open"` clears it — real mutable state,
   * unlike legacy's append-a-second-row hack (see the schema doc comment on `ClientTask`).
   */
  async updateTask(
    clientId: string,
    taskId: string,
    input: UpdateTaskInput,
    user: AuthUser,
  ): Promise<ClientTaskDTO> {
    await requireClient(clientId);
    const updated = await withTransaction(async (tx) => {
      const data: Parameters<typeof clientTaskRepository.update>[2] = { ...input };
      if (input.status === "done") data.completedAt = new Date();
      else if (input.status === "open") data.completedAt = null;
      const count = await clientTaskRepository.update(clientId, taskId, data, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Task not found");
      const row = await clientTaskRepository.findById(taskId, tx);
      if (!row) throw new AppError("NOT_FOUND", "Task not found");
      await writeAudit(tx, {
        entity: "client_task",
        entityId: taskId,
        actor: user.id,
        action: "update_task",
        after: { clientId, ...input },
      });
      return row;
    });
    return toTaskDTO(updated);
  },

  async removeTask(clientId: string, taskId: string, user: AuthUser): Promise<void> {
    await requireClient(clientId);
    await withTransaction(async (tx) => {
      const count = await clientTaskRepository.softDelete(clientId, taskId, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Task not found");
      await writeAudit(tx, {
        entity: "client_task",
        entityId: taskId,
        actor: user.id,
        action: "remove_task",
        after: { clientId },
      });
    });
  },

  // --- Meetings (Wave 4.2 slice 2) ----------------------------------------

  async addMeeting(
    clientId: string,
    input: AddMeetingInput,
    user: AuthUser,
  ): Promise<ClientMeetingDTO> {
    await requireClient(clientId);
    const created = await withTransaction(async (tx) => {
      const row = await clientMeetingRepository.create(
        { ...input, clientId, loggedById: user.id },
        tx,
      );
      await writeAudit(tx, {
        entity: "client_meeting",
        entityId: row.id,
        actor: user.id,
        action: "add_meeting",
        after: { clientId, type: row.type },
      });
      return row;
    });
    return toMeetingDTO(created);
  },

  async removeMeeting(clientId: string, meetingId: string, user: AuthUser): Promise<void> {
    await requireClient(clientId);
    await withTransaction(async (tx) => {
      const count = await clientMeetingRepository.softDelete(clientId, meetingId, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Meeting not found");
      await writeAudit(tx, {
        entity: "client_meeting",
        entityId: meetingId,
        actor: user.id,
        action: "remove_meeting",
        after: { clientId },
      });
    });
  },

  // --- Deals (Wave 4.2 slice 3) --------------------------------------------

  async addDeal(clientId: string, input: CreateDealInput, user: AuthUser): Promise<DealDTO> {
    await requireClient(clientId);
    const created = await withTransaction(async (tx) => {
      const row = await dealRepository.create({ ...input, clientId, createdById: user.id }, tx);
      await writeAudit(tx, {
        entity: "deal",
        entityId: row.id,
        actor: user.id,
        action: "add_deal",
        after: { clientId, name: row.name },
      });
      return row;
    });
    return toDealDTO(created, []);
  },

  /**
   * A `stage` transition to `Signed`/`Lost` stamps `closedAt`; moving back to an open stage
   * clears it — mirrors `updateTask`'s `status`→`completedAt` pattern exactly.
   */
  async updateDeal(
    clientId: string,
    dealId: string,
    input: UpdateDealInput,
    user: AuthUser,
  ): Promise<DealDTO> {
    await requireClient(clientId);
    const updated = await withTransaction(async (tx) => {
      const data: Parameters<typeof dealRepository.update>[2] = { ...input };
      if (input.stage) data.closedAt = isClosedDealStage(input.stage) ? new Date() : null;
      const count = await dealRepository.update(clientId, dealId, data, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Deal not found");
      const row = await dealRepository.findById(dealId, tx);
      if (!row) throw new AppError("NOT_FOUND", "Deal not found");
      await writeAudit(tx, {
        entity: "deal",
        entityId: dealId,
        actor: user.id,
        action: "update_deal",
        after: { clientId, ...input },
      });
      return row;
    });
    const blockers = await dealBlockerRepository.listForDeal(dealId);
    return toDealDTO(updated, blockers);
  },

  async removeDeal(clientId: string, dealId: string, user: AuthUser): Promise<void> {
    await requireClient(clientId);
    await withTransaction(async (tx) => {
      const count = await dealRepository.softDelete(clientId, dealId, user.id, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Deal not found");
      await writeAudit(tx, {
        entity: "deal",
        entityId: dealId,
        actor: user.id,
        action: "remove_deal",
        after: { clientId },
      });
    });
  },

  // --- Deal blockers (Wave 4.2 slice 3) ------------------------------------

  async addBlocker(
    clientId: string,
    dealId: string,
    input: AddBlockerInput,
    user: AuthUser,
  ): Promise<DealBlockerDTO> {
    await requireClient(clientId);
    const deal = await dealRepository.findById(dealId);
    if (!deal || deal.clientId !== clientId) throw new AppError("NOT_FOUND", "Deal not found");
    const created = await withTransaction(async (tx) => {
      const row = await dealBlockerRepository.create({ ...input, dealId }, tx);
      await writeAudit(tx, {
        entity: "deal_blocker",
        entityId: row.id,
        actor: user.id,
        action: "add_blocker",
        after: { dealId, text: row.text },
      });
      return row;
    });
    return toBlockerDTO(created);
  },

  /** `resolved: true` stamps `resolvedAt`; `false` clears it. */
  async updateBlocker(
    clientId: string,
    dealId: string,
    blockerId: string,
    input: UpdateBlockerInput,
    user: AuthUser,
  ): Promise<DealBlockerDTO> {
    await requireClient(clientId);
    const deal = await dealRepository.findById(dealId);
    if (!deal || deal.clientId !== clientId) throw new AppError("NOT_FOUND", "Deal not found");
    const updated = await withTransaction(async (tx) => {
      const count = await dealBlockerRepository.update(
        dealId,
        blockerId,
        { resolved: input.resolved, resolvedAt: input.resolved ? new Date() : null },
        tx,
      );
      if (count === 0) throw new AppError("NOT_FOUND", "Blocker not found");
      const rows = await dealBlockerRepository.listForDeal(dealId, tx);
      const row = rows.find((r) => r.id === blockerId);
      if (!row) throw new AppError("NOT_FOUND", "Blocker not found");
      await writeAudit(tx, {
        entity: "deal_blocker",
        entityId: blockerId,
        actor: user.id,
        action: "update_blocker",
        after: { dealId, resolved: input.resolved },
      });
      return row;
    });
    return toBlockerDTO(updated);
  },

  async removeBlocker(
    clientId: string,
    dealId: string,
    blockerId: string,
    user: AuthUser,
  ): Promise<void> {
    await requireClient(clientId);
    const deal = await dealRepository.findById(dealId);
    if (!deal || deal.clientId !== clientId) throw new AppError("NOT_FOUND", "Deal not found");
    await withTransaction(async (tx) => {
      const count = await dealBlockerRepository.delete(dealId, blockerId, tx);
      if (count === 0) throw new AppError("NOT_FOUND", "Blocker not found");
      await writeAudit(tx, {
        entity: "deal_blocker",
        entityId: blockerId,
        actor: user.id,
        action: "remove_blocker",
        after: { dealId },
      });
    });
  },
};
