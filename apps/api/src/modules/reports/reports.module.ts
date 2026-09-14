import { Module } from "@nestjs/common";
import { pipelineReportsService } from "@destaworks/application/reports/pipeline-reports.service";
import { clientReportsService } from "@destaworks/application/reports/client-reports.service";
import { teamReportsService } from "@destaworks/application/reports/team-reports.service";
import { timeReportsService } from "@destaworks/application/reports/time-reports.service";
import { reportFilterOptionsService } from "@destaworks/application/reports/filter-options.service";
import { exportService } from "@destaworks/application/reports/export.service";
import { reportExportService } from "@destaworks/application/reports/report-export.service";
import { massJourneyReport } from "@destaworks/application/reports/mass-journey.report";
import { trendsReport } from "@destaworks/application/reports/trends.report";
import { provideService } from "../service-token";
import { ReportsController } from "./reports.controller";
import {
  CLIENT_REPORTS_SERVICE,
  EXPORT_SERVICE,
  MASS_JOURNEY_REPORT,
  PIPELINE_REPORTS_SERVICE,
  REPORT_EXPORT_SERVICE,
  REPORT_FILTER_OPTIONS_SERVICE,
  TEAM_REPORTS_SERVICE,
  TIME_REPORTS_SERVICE,
  TRENDS_REPORT,
} from "./reports.tokens";

/**
 * Reporting across the pipeline, clients, team and time, plus the filter vocabularies the
 * report UI offers and CSV/XLSX export. Export is a long read that Phase 5 moves to a job; the
 * module boundary is what makes that a one-file change.
 *
 * The services are bound to tokens (`reports.tokens.ts`) rather than imported by the controller,
 * so `ReportsController` injects one instead of reaching for the singleton and becoming untestable.
 */
@Module({
  controllers: [ReportsController],
  providers: [
    provideService(PIPELINE_REPORTS_SERVICE, pipelineReportsService),
    provideService(CLIENT_REPORTS_SERVICE, clientReportsService),
    provideService(TEAM_REPORTS_SERVICE, teamReportsService),
    provideService(TIME_REPORTS_SERVICE, timeReportsService),
    provideService(REPORT_FILTER_OPTIONS_SERVICE, reportFilterOptionsService),
    provideService(EXPORT_SERVICE, exportService),
    provideService(REPORT_EXPORT_SERVICE, reportExportService),
    provideService(MASS_JOURNEY_REPORT, massJourneyReport),
    provideService(TRENDS_REPORT, trendsReport),
  ],
  exports: [
    PIPELINE_REPORTS_SERVICE,
    CLIENT_REPORTS_SERVICE,
    TEAM_REPORTS_SERVICE,
    TIME_REPORTS_SERVICE,
    REPORT_FILTER_OPTIONS_SERVICE,
    EXPORT_SERVICE,
    REPORT_EXPORT_SERVICE,
    MASS_JOURNEY_REPORT,
    TRENDS_REPORT,
  ],
})
export class ReportsModule {}
