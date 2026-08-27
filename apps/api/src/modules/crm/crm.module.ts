import { Module } from "@nestjs/common";
import { clientService } from "@destaworks/application/client.service";
import { clientNoteService } from "@destaworks/application/client-note.service";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";
import { crmAiWorkspaceService } from "@destaworks/application/crm-ai-workspace.service";
import { provideService, serviceToken } from "../service-token";

export const CLIENT_SERVICE = serviceToken<typeof clientService>("CLIENT_SERVICE");
export const CLIENT_NOTE_SERVICE = serviceToken<typeof clientNoteService>("CLIENT_NOTE_SERVICE");
export const CRM_ANALYTICS_SERVICE =
  serviceToken<typeof crmAnalyticsService>("CRM_ANALYTICS_SERVICE");
export const CRM_AI_WORKSPACE_SERVICE = serviceToken<typeof crmAiWorkspaceService>(
  "CRM_AI_WORKSPACE_SERVICE",
);

/**
 * The client side of the business: client records, notes against them, and the analytics and
 * AI workspace built on top. Candidate-facing work is `CandidatesModule`.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(CLIENT_SERVICE, clientService),
    provideService(CLIENT_NOTE_SERVICE, clientNoteService),
    provideService(CRM_ANALYTICS_SERVICE, crmAnalyticsService),
    provideService(CRM_AI_WORKSPACE_SERVICE, crmAiWorkspaceService),
  ],
  exports: [CLIENT_SERVICE, CLIENT_NOTE_SERVICE, CRM_ANALYTICS_SERVICE, CRM_AI_WORKSPACE_SERVICE],
})
export class CrmModule {}
