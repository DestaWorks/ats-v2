import { pipelineReportsService } from "@destaworks/application/reports/pipeline-reports.service";
import { clientReportsService } from "@destaworks/application/reports/client-reports.service";
import { teamReportsService } from "@destaworks/application/reports/team-reports.service";
import { timeReportsService } from "@destaworks/application/reports/time-reports.service";
import { reportFilterOptionsService } from "@destaworks/application/reports/filter-options.service";
import { exportService } from "@destaworks/application/reports/export.service";
import { massJourneyReport } from "@destaworks/application/reports/mass-journey.report";
import { trendsReport } from "@destaworks/application/reports/trends.report";
import { serviceToken } from "../service-token";

/**
 * The reporting injection tokens, in their own module.
 *
 * Not in `reports.module.ts`, because the module lists the controller and the controller needs the
 * tokens: with both in one file the import cycle resolves the token to `undefined` at the moment
 * `@Inject(...)` evaluates, and Nest fails to construct the controller. A leaf file that imports
 * only the services it names cannot participate in that cycle.
 */
export const PIPELINE_REPORTS_SERVICE = serviceToken<typeof pipelineReportsService>(
  "PIPELINE_REPORTS_SERVICE",
);
export const CLIENT_REPORTS_SERVICE =
  serviceToken<typeof clientReportsService>("CLIENT_REPORTS_SERVICE");
export const TEAM_REPORTS_SERVICE = serviceToken<typeof teamReportsService>("TEAM_REPORTS_SERVICE");
export const TIME_REPORTS_SERVICE = serviceToken<typeof timeReportsService>("TIME_REPORTS_SERVICE");
export const REPORT_FILTER_OPTIONS_SERVICE = serviceToken<typeof reportFilterOptionsService>(
  "REPORT_FILTER_OPTIONS_SERVICE",
);
export const EXPORT_SERVICE = serviceToken<typeof exportService>("EXPORT_SERVICE");
export const MASS_JOURNEY_REPORT = serviceToken<typeof massJourneyReport>("MASS_JOURNEY_REPORT");
export const TRENDS_REPORT = serviceToken<typeof trendsReport>("TRENDS_REPORT");
