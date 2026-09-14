import { Module } from "@nestjs/common";
import { clientService } from "@destaworks/application/client.service";
import { clientNoteService } from "@destaworks/application/client-note.service";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";
import { crmAiWorkspaceService } from "@destaworks/application/crm-ai-workspace.service";
import { provideService } from "../service-token";
import { PortalModule } from "../portal/portal.module";
import { CrmAiWorkspaceController } from "./crm-ai-workspace.controller";
import { CrmAnalyticsController } from "./crm-analytics.controller";
import { CrmClientContactsController } from "./client-contacts.controller";
import { CrmClientDealsController } from "./client-deals.controller";
import { CrmClientMeetingsController } from "./client-meetings.controller";
import { CrmClientNotesController } from "./client-notes.controller";
import { CrmClientPortalAdminController } from "./client-portal-admin.controller";
import { CrmClientTasksController } from "./client-tasks.controller";
import { CrmClientsController } from "./clients.controller";
import {
  CLIENT_NOTE_SERVICE,
  CLIENT_SERVICE,
  CRM_AI_WORKSPACE_SERVICE,
  CRM_ANALYTICS_SERVICE,
} from "./crm.tokens";

export {
  CLIENT_NOTE_SERVICE,
  CLIENT_SERVICE,
  CRM_AI_WORKSPACE_SERVICE,
  CRM_ANALYTICS_SERVICE,
} from "./crm.tokens";

/**
 * The client side of the business: client records, notes against them, and the analytics and
 * AI workspace built on top. Candidate-facing work is `CandidatesModule`.
 *
 * `PortalModule` is imported for one reason: the `/crm/clients/:id/portal/**` routes are the
 * OPERATOR's view of portal access, so they belong to the CRM surface and its URL space, while the
 * service that mints and revokes those links belongs to the portal. Importing the module borrows
 * the service instead of binding a second provider for it.
 */
@Module({
  imports: [PortalModule],
  controllers: [
    CrmClientsController,
    CrmClientContactsController,
    CrmClientDealsController,
    CrmClientTasksController,
    CrmClientMeetingsController,
    CrmClientNotesController,
    CrmClientPortalAdminController,
    CrmAnalyticsController,
    CrmAiWorkspaceController,
  ],
  providers: [
    provideService(CLIENT_SERVICE, clientService),
    provideService(CLIENT_NOTE_SERVICE, clientNoteService),
    provideService(CRM_ANALYTICS_SERVICE, crmAnalyticsService),
    provideService(CRM_AI_WORKSPACE_SERVICE, crmAiWorkspaceService),
  ],
  exports: [CLIENT_SERVICE, CLIENT_NOTE_SERVICE, CRM_ANALYTICS_SERVICE, CRM_AI_WORKSPACE_SERVICE],
})
export class CrmModule {}
