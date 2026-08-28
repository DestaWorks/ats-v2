import { Controller, Get, Header, Inject, Query, UseGuards } from "@nestjs/common";
import {
  reportFiltersSchema,
  type ClientCapacityDTO,
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
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import {
  CLIENT_REPORTS_SERVICE,
  EXPORT_SERVICE,
  MASS_JOURNEY_REPORT,
  PIPELINE_REPORTS_SERVICE,
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
 * cohort the `/reports` page drives.
 *
 * `viewReports` is declared ONCE at the class level rather than per method. Every route here is
 * leadership-only, so a per-method decorator would be eleven chances to forget one — and
 * `CapabilityGuard` refuses a handler that declares nothing, so a new method added to this
 * controller inherits the gate instead of shipping open.
 *
 * Two of the twelve take no filters (`client-capacity` and `trends` are unfiltered/all-time by
 * design, matching the legacy widgets they replace), and `export` answers `text/csv` rather than
 * JSON. Both differences are deliberate and preserved from the routes this replaces.
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
    @Inject(MASS_JOURNEY_REPORT)
    private readonly massJourney: ServiceOf<typeof MASS_JOURNEY_REPORT>,
    @Inject(TRENDS_REPORT) private readonly trendsReport: ServiceOf<typeof TRENDS_REPORT>,
    @Inject(EXPORT_SERVICE) private readonly exports: ServiceOf<typeof EXPORT_SERVICE>,
  ) {}

  /** GET /reports/executive — Executive Summary. */
  @Get("executive")
  executive(@Filters() filters: ReportFilters): Promise<ExecutiveSummaryDTO> {
    return this.pipelineReports.executiveSummary(filters);
  }

  /** GET /reports/pipeline-funnel — stage-by-stage funnel with conversion. */
  @Get("pipeline-funnel")
  pipelineFunnel(@Filters() filters: ReportFilters): Promise<PipelineFunnelDTO> {
    return this.pipelineReports.pipelineFunnel(filters);
  }

  /** GET /reports/client-funnel — per-client funnel plus week-over-week deltas. */
  @Get("client-funnel")
  clientFunnel(@Filters() filters: ReportFilters): Promise<ClientFunnelDTO> {
    return this.clientReports.perClientFunnel(filters);
  }

  /** GET /reports/client-portfolio — placements and pipeline value per client. */
  @Get("client-portfolio")
  clientPortfolio(@Filters() filters: ReportFilters): Promise<ClientPortfolioDTO> {
    return this.clientReports.clientPortfolio(filters);
  }

  /** GET /reports/client-capacity — unfiltered/all-time by design, matching legacy `vw="kpi"`. */
  @Get("client-capacity")
  clientCapacity(): Promise<ClientCapacityDTO> {
    return this.clientReports.clientCapacity();
  }

  /** GET /reports/team-performance — per-recruiter throughput. */
  @Get("team-performance")
  teamPerformance(@Filters() filters: ReportFilters): Promise<TeamPerformanceDTO> {
    return this.teamReports.teamPerformance(filters);
  }

  /** GET /reports/source-roi — yield per sourcing channel. */
  @Get("source-roi")
  sourceRoi(@Filters() filters: ReportFilters): Promise<SourceRoiDTO> {
    return this.teamReports.sourceRoi(filters);
  }

  /** GET /reports/time-analysis — time-in-stage and cycle time. */
  @Get("time-analysis")
  timeAnalysis(@Filters() filters: ReportFilters): Promise<TimeAnalysisDTO> {
    return this.timeReports.timeAnalysis(filters);
  }

  /** GET /reports/compliance — credential/licence expiry exposure. */
  @Get("compliance")
  compliance(@Filters() filters: ReportFilters): Promise<ComplianceDTO> {
    return this.timeReports.compliance(filters);
  }

  /** GET /reports/mass-journey — the Gantt view of candidate journeys. */
  @Get("mass-journey")
  massJourneyReport(@Filters() filters: ReportFilters): Promise<MassJourneyDTO> {
    return this.massJourney.massJourney(filters);
  }

  /** GET /reports/trends — rolling W/M/Q anomalies. Team-wide, matching legacy's scope. */
  @Get("trends")
  trends(): Promise<TrendsDTO> {
    return this.trendsReport.trends();
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
  exportCsv(@Filters() filters: ReportFilters): Promise<string> {
    return this.exports.candidatesCsv(filters);
  }
}
