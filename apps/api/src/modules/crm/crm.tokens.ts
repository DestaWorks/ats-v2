import { clientService } from "@destaworks/application/client.service";
import { clientNoteService } from "@destaworks/application/client-note.service";
import { crmAnalyticsService } from "@destaworks/application/crm-analytics.service";
import { crmAiWorkspaceService } from "@destaworks/application/crm-ai-workspace.service";
import { serviceToken } from "../service-token";

/** @see ../saved-views/saved-views.tokens — why tokens live outside the module file. */
export const CLIENT_SERVICE = serviceToken<typeof clientService>("CLIENT_SERVICE");
export const CLIENT_NOTE_SERVICE = serviceToken<typeof clientNoteService>("CLIENT_NOTE_SERVICE");
export const CRM_ANALYTICS_SERVICE =
  serviceToken<typeof crmAnalyticsService>("CRM_ANALYTICS_SERVICE");
export const CRM_AI_WORKSPACE_SERVICE = serviceToken<typeof crmAiWorkspaceService>(
  "CRM_AI_WORKSPACE_SERVICE",
);
