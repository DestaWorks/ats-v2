import type { ClientNoteDTO } from "@destaworks/contracts/validation/client-note";
import type {
  GenerateWorkspaceInput,
  WorkspaceResultDTO,
} from "@destaworks/contracts/validation/crm-ai-workspace";
import { defined } from "@destaworks/domain/utils/defined";
import type { AuthUser } from "@destaworks/auth/guards";
import {
  generateWorkspaceText,
  type WorkspaceContext,
} from "@destaworks/integrations/ai/crm/ai-workspace";
import { clientRepository } from "@destaworks/db/repositories/client.repository";
import { clientNoteRepository } from "@destaworks/db/repositories/client-note.repository";
import { clientMeetingRepository } from "@destaworks/db/repositories/client-meeting.repository";
import { clientTaskRepository } from "@destaworks/db/repositories/client-task.repository";
import { dealRepository } from "@destaworks/db/repositories/deal.repository";
import { clientNoteService } from "./client-note.service";
import { AppError } from "@destaworks/integrations/http/app-error";

/** Recent-activity lines fed into the prompt — capped like `buildTimeline`'s 40 (`client.service.ts`). */
const ACTIVITY_LINE_CAP = 30;

async function requireClient(id: string) {
  const client = await clientRepository.findById(id);
  if (!client) throw new AppError("NOT_FOUND", "Client not found");
  return client;
}

async function buildContext(clientId: string): Promise<WorkspaceContext> {
  const client = await requireClient(clientId);
  const [notes, meetings, tasks, deals] = await Promise.all([
    clientNoteRepository.listForClient(clientId),
    clientMeetingRepository.listForClient(clientId),
    clientTaskRepository.listForClient(clientId),
    dealRepository.listForClient(clientId),
  ]);

  const entries = [
    ...notes.map((n) => ({ at: n.createdAt, line: `[Note] ${n.text}` })),
    ...meetings.map((m) => ({
      at: m.createdAt,
      line: `[Meeting: ${m.type}] ${m.notes ?? "(no notes)"}${m.actionItems ? ` — action items: ${m.actionItems}` : ""}`,
    })),
    ...tasks.map((t) => ({
      at: t.createdAt,
      line: `[Task] ${t.title} (${t.status}${t.completedAt ? `, done` : ""})`,
    })),
    ...deals.map((d) => ({ at: d.updatedAt, line: `[Deal] ${d.name} — stage: ${d.stage}` })),
  ];
  entries.sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    clientName: client.name,
    priority: client.priority,
    cadence: client.cadence,
    recentActivity: entries.slice(0, ACTIVITY_LINE_CAP).map((e) => e.line),
  };
}

/**
 * AI Client Workspace service (Wave 4.2 flex) — assembles context from real CRM tables and
 * calls the provider-agnostic AI module. `logNote` is the "Log to CRM" action: writes a REAL
 * `ClientNote` row (not legacy's truncated stringly-typed activity blob).
 */
export const crmAiWorkspaceService = {
  async generate(clientId: string, input: GenerateWorkspaceInput): Promise<WorkspaceResultDTO> {
    const ctx = await buildContext(clientId);
    return generateWorkspaceText(ctx, defined(input));
  },

  async logNote(clientId: string, text: string, user: AuthUser): Promise<ClientNoteDTO> {
    return clientNoteService.create(clientId, { text }, user);
  },
};
