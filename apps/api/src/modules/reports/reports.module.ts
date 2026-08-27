import { Module } from "@nestjs/common";
import { pipelineReportsService } from "@destaworks/application/reports/pipeline-reports.service";
import { clientReportsService } from "@destaworks/application/reports/client-reports.service";
import { teamReportsService } from "@destaworks/application/reports/team-reports.service";
import { timeReportsService } from "@destaworks/application/reports/time-reports.service";
import { reportFilterOptionsService } from "@destaworks/application/reports/filter-options.service";
import { exportService } from "@destaworks/application/reports/export.service";
import { provideService, serviceToken } from "../service-token";

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

/**
 * Reporting across the pipeline, clients, team and time, plus the filter vocabularies the
 * report UI offers and CSV/XLSX export. Export is a long read that Phase 5 moves to a job; the
 * module boundary is what makes that a one-file change.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(PIPELINE_REPORTS_SERVICE, pipelineReportsService),
    provideService(CLIENT_REPORTS_SERVICE, clientReportsService),
    provideService(TEAM_REPORTS_SERVICE, teamReportsService),
    provideService(TIME_REPORTS_SERVICE, timeReportsService),
    provideService(REPORT_FILTER_OPTIONS_SERVICE, reportFilterOptionsService),
    provideService(EXPORT_SERVICE, exportService),
  ],
  exports: [
    PIPELINE_REPORTS_SERVICE,
    CLIENT_REPORTS_SERVICE,
    TEAM_REPORTS_SERVICE,
    TIME_REPORTS_SERVICE,
    REPORT_FILTER_OPTIONS_SERVICE,
    EXPORT_SERVICE,
  ],
})
export class ReportsModule {}
