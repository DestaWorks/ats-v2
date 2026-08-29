import { Controller, Get, Header, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  reportFiltersSchema,
  type ClientCapacityDTO,
  type ReportExportDTO,
  type ClientFunnelDTO,
  type ClientPortfolioDTO,
  type ComplianceDTO,
  type ExecutiveSummaryDTO,
  type MassJourneyDTO,
  type PipelineFunnelDTO,
  type ReportFilters,
  type SourceRoiDTO,
  type TeamPerformanceDTO,
  type TimeAnalysisDTO,
  type TrendsDTO,
} from "@destaworks/contracts/validation/reports";
import type { GetReportsFilterOptionsResponse } from "@destaworks/contracts/reports/filter-options";
import type { AuthContext } from "@destaworks/auth/guards";
import { logger } from "@destaworks/config/logger";
import { reportExportJob } from "@destaworks/jobs/definitions/report-export.job";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import { JOB_QUEUE } from "../jobs/jobs.tokens";
import type { ServiceOf } from "../service-token";
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
 * The universal filter bar, parsed once. Every filtered report takes the SAME query contract, so
 * the schema, the pipe instance and the parameter decorator exist once between all of them —
 * eleven copies of `reportFiltersFromParams(new URL(req.url).searchParams)` is exactly the
 * duplication this controller replaces.
 */
const reportFiltersPipe = new ZodValidationPipe(reportFiltersSchema);

/** `@Filters() filters: ReportFilters` — the validated universal filter bar. */
const Filters = (): ParameterDecorator => Query(reportFiltersPipe);

/**
 * Reporting: the eleven read-only report endpoints plus the CSV export, all over the one filtered
 * cohort the `/reports` page drives, and the vocabularies that page's filter bar is built from.
 *
 * `viewReports` is declared ONCE at the class level rather than per method. Every route here is
 * leadership-only, so a per-method decorator would be eleven chances to forget one — and
 * `CapabilityGuard` refuses a handler that declares nothing, so a new method added to this
 * controller inherits the gate instead of shipping open.
 *
 * `client-capacity` and `trends` take no filters (unfiltered/all-time by design, matching the
 * legacy widgets they replace), `filter-options` takes none because it is what the bar is built
 * from, and `export` answers `text/csv` rather than JSON. Each difference is deliberate.
 */
@Controller("reports")
@UseGuards(CapabilityGuard)
@RequireCapability("viewReports")
export class ReportsController {
  constructor(
    @Inject(PIPELINE_REPORTS_SERVICE)
    private readonly pipelineReports: ServiceOf<typeof PIPELINE_REPORTS_SERVICE>,
    @Inject(CLIENT_REPORTS_SERVICE)
    private readonly clientReports: ServiceOf<typeof CLIENT_REPORTS_SERVICE>,
    @Inject(TEAM_REPORTS_SERVICE)
    private readonly teamReports: ServiceOf<typeof TEAM_REPORTS_SERVICE>,
    @Inject(TIME_REPORTS_SERVICE)
    private readonly timeReports: ServiceOf<typeof TIME_REPORTS_SERVICE>,
    @Inject(REPORT_FILTER_OPTIONS_SERVICE)
    private readonly filterOptionsService: ServiceOf<typeof REPORT_FILTER_OPTIONS_SERVICE>,
    @Inject(MASS_JOURNEY_REPORT)
    private readonly massJourney: ServiceOf<typeof MASS_JOURNEY_REPORT>,
    @Inject(TRENDS_REPORT) private readonly trendsReport: ServiceOf<typeof TRENDS_REPORT>,
    @Inject(EXPORT_SERVICE) private readonly exports: ServiceOf<typeof EXPORT_SERVICE>,
    @Inject(REPORT_EXPORT_SERVICE)
    private readonly exportJobs: ServiceOf<typeof REPORT_EXPORT_SERVICE>,
    @Inject(JOB_QUEUE) private readonly queue: ServiceOf<typeof JOB_QUEUE>,
  ) {}

  /**
   * GET /reports/filter-options — the vocabularies the filter bar offers.
   *
   * Takes no filters: it IS the filter bar's source. A literal two-segment path, so it cannot be
   * captured by `export/jobs/:id`, the only parameterised route here.
   */
  @Get("filter-options")
  filterOptions(@CurrentUser() user: AuthContext): Promise<GetReportsFilterOptionsResponse> {
    return this.filterOptionsService.load(user);
  }

  /** GET /reports/executive — Executive Summary. */
  @Get("executive")
  executive(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<ExecutiveSummaryDTO> {
    return this.pipelineReports.executiveSummary(user, filters);
  }

  /** GET /reports/pipeline-funnel — stage-by-stage funnel with conversion. */
  @Get("pipeline-funnel")
  pipelineFunnel(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<PipelineFunnelDTO> {
    return this.pipelineReports.pipelineFunnel(user, filters);
  }

  /** GET /reports/client-funnel — per-client funnel plus week-over-week deltas. */
  @Get("client-funnel")
  clientFunnel(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<ClientFunnelDTO> {
    return this.clientReports.perClientFunnel(user, filters);
  }

  /** GET /reports/client-portfolio — placements and pipeline value per client. */
  @Get("client-portfolio")
  clientPortfolio(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<ClientPortfolioDTO> {
    return this.clientReports.clientPortfolio(user, filters);
  }

  /** GET /reports/client-capacity — unfiltered/all-time by design, matching legacy `vw="kpi"`. */
  @Get("client-capacity")
  clientCapacity(@CurrentUser() user: AuthContext): Promise<ClientCapacityDTO> {
    return this.clientReports.clientCapacity(user);
  }

  /** GET /reports/team-performance — per-recruiter throughput. */
  @Get("team-performance")
  teamPerformance(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<TeamPerformanceDTO> {
    return this.teamReports.teamPerformance(user, filters);
  }

  /** GET /reports/source-roi — yield per sourcing channel. */
  @Get("source-roi")
  sourceRoi(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<SourceRoiDTO> {
    return this.teamReports.sourceRoi(user, filters);
  }

  /** GET /reports/time-analysis — time-in-stage and cycle time. */
  @Get("time-analysis")
  timeAnalysis(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<TimeAnalysisDTO> {
    return this.timeReports.timeAnalysis(user, filters);
  }

  /** GET /reports/compliance — credential/licence expiry exposure. */
  @Get("compliance")
  compliance(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<ComplianceDTO> {
    return this.timeReports.compliance(user, filters);
  }

  /** GET /reports/mass-journey — the Gantt view of candidate journeys. */
  @Get("mass-journey")
  massJourneyReport(
    @Filters() filters: ReportFilters,
    @CurrentUser() user: AuthContext,
  ): Promise<MassJourneyDTO> {
    return this.massJourney.massJourney(user, filters);
  }

  /** GET /reports/trends — rolling W/M/Q anomalies. Team-wide, matching legacy's scope. */
  @Get("trends")
  trends(@CurrentUser() user: AuthContext): Promise<TrendsDTO> {
    return this.trendsReport.trends(user);
  }

  /**
   * GET /reports/export — the filtered cohort as a CSV file download.
   *
   * The one endpoint here that is not JSON: its only consumer is an `<a href>` download link, so
   * it answers `text/csv` with a filename and no envelope of any kind. `@Header` sets the type
   * BEFORE the body is written, which is what stops Express defaulting a returned string to
   * `text/html`. A failure still renders the standard JSON error envelope — the headers are only
   * applied on the success path — so an unauthorized caller gets the same 403 body as everywhere
   * else rather than a CSV file containing an error.
   */
  @Get("export")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="candidates-report.csv"')
  exportCsv(@CurrentUser() user: AuthContext, @Filters() filters: ReportFilters): Promise<string> {
    return this.exports.candidatesCsv(user, filters);
  }

  /**
   * POST /reports/export/jobs — ask for the same CSV, built off the request path.
   *
   * The route above is bounded only by how big the filtered cohort happens to be; this one
   * answers in a database round trip and an enqueue, and the file is fetched later through
   * `GET /reports/export/jobs/:id`.
   *
   * The row and the job are written in that order rather than in one transaction: the queue port
   * accepts a `tx` for exactly this pairing, but the driver behind it is installed at runtime and
   * may not be Postgres-backed, so the controller cannot assume the two share a transaction. A
   * failed enqueue therefore marks the export failed itself — the alternative is a row that sits
   * on `pending` for a job that was never queued.
   */
  @Post("export/jobs")
  async requestExport(
    @CurrentUser() user: AuthContext,
    @Filters() filters: ReportFilters,
  ): Promise<ReportExportDTO> {
    const row = await this.exportJobs.request(user, user.user.id, filters);
    try {
      await this.queue.enqueue(reportExportJob, {
        exportId: row.id,
        tenantId: user.tenantId,
        filters,
      });
    } catch (err) {
      await this.exportJobs.fail(row.id, user.tenantId, "INTERNAL");
      logger.error("reports.export.enqueue_failed", {
        exportId: row.id,
        errorType: err instanceof Error ? err.name : "UnknownError",
      });
      throw err;
    }
    return this.exportJobs.get(user, row.id, user.user.id);
  }

  /**
   * GET /reports/export/jobs/:id — poll one export, and collect it once it is ready.
   *
   * Answers a small JSON envelope, never the file: the download is a signed URL minted here and
   * valid for minutes, so the CSV of candidate PII is never served from a cacheable app response
   * and never sits behind a permanent address. `viewReports` gates the endpoint; the service
   * additionally refuses an export the caller did not request.
   */
  @Get("export/jobs/:id")
  getExport(@CurrentUser() user: AuthContext, @Param("id") id: string): Promise<ReportExportDTO> {
    return this.exportJobs.get(user, id, user.user.id);
  }
}
