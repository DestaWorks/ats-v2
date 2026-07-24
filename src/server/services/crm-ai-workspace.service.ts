import "server-only";
import type { ClientNoteDTO } from "@/lib/validation/client-note";
import type { GenerateWorkspaceInput, WorkspaceResultDTO } from "@/lib/validation/crm-ai-workspace";
import type { AuthUser } from "@/server/auth/guards";
import { generateWorkspaceText, type WorkspaceContext } from "@/server/ai/crm/ai-workspace";
import { clientRepository } from "@/server/repositories/client.repository";
import { clientNoteRepository } from "@/server/repositories/client-note.repository";
import { clientMeetingRepository } from "@/server/repositories/client-meeting.repository";
import { clientTaskRepository } from "@/server/repositories/client-task.repository";
import { dealRepository } from "@/server/repositories/deal.repository";
import { clientNoteService } from "@/server/services/client-note.service";
import { AppError } from "@/server/http/app-error";

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
    return generateWorkspaceText(ctx, input);
  },

  async logNote(clientId: string, text: string, user: AuthUser): Promise<ClientNoteDTO> {
    return clientNoteService.create(clientId, { text }, user);
  },
};
