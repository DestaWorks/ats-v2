import { Module, type Provider } from "@nestjs/common";
import { APP_FILTER, APP_INTERCEPTOR } from "@nestjs/core";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";
import { AuditActorInterceptor } from "./common/interceptors/audit-actor.interceptor";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { AccountModule } from "./modules/account/account.module";
import { ActivityModule } from "./modules/activity/activity.module";
import { AdminModule } from "./modules/admin/admin.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { BriefsModule } from "./modules/briefs/briefs.module";
import { CandidatesModule } from "./modules/candidates/candidates.module";
import { CredentialsModule } from "./modules/credentials/credentials.module";
import { CrmModule } from "./modules/crm/crm.module";
import { DailyModule } from "./modules/daily/daily.module";
import { DiscoverModule } from "./modules/discover/discover.module";
import { HealthModule } from "./modules/health/health.module";
import { InboundModule } from "./modules/inbound/inbound.module";
import { JobsModule } from "./modules/jobs/jobs.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { MentionsModule } from "./modules/mentions/mentions.module";
import { MigrationModule } from "./modules/migration/migration.module";
import { PipelineModule } from "./modules/pipeline/pipeline.module";
import { PortalModule } from "./modules/portal/portal.module";
import { ProspectsModule } from "./modules/prospects/prospects.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ResumeModule } from "./modules/resume/resume.module";
import { RolesModule } from "./modules/roles/roles.module";
import { SavedViewsModule } from "./modules/saved-views/saved-views.module";
import { ScreeningModule } from "./modules/screening/screening.module";
import { TemplatesModule } from "./modules/templates/templates.module";
import { TenantsModule } from "./modules/tenants/tenants.module";

/**
 * The composition root: the domain areas, plus the cross-cutting concerns that must apply to
 * every request. The modules below grow controllers in Phase 4.3 as their routes cut over.
 *
 * Interceptor ORDER is load-bearing. `RequestIdInterceptor` runs first so the id exists — stamped
 * on the request and entered into the log context — before `LoggingInterceptor` writes the line or
 * the exception filter reads it back as `error.ref`.
 *
 * Two cross-cutting classes are deliberately NOT global:
 *   - `CapabilityGuard` DENIES when a handler declares no capability, so registering it globally
 *     would refuse every undecorated route. It is attached per controller/route, which is what
 *     makes a forgotten `@RequireCapability` fail closed instead of silently open.
 *   - `ZodValidationPipe` is constructed with the contract schema for one handler, so it binds at
 *     the parameter, never globally.
 *
 * The module list mirrors the boundaries `@destaworks/application` already has, so a route moving
 * from `apps/web/src/app/api/<area>` has exactly one module it can belong to. It is not a new
 * decomposition of the domain, and it is not a folder per URL segment — route areas that a single
 * service already serves (briefs/targets, roles/client-match-profiles) share one module.
 */
/**
 * The request pipeline every route passes through, exported so a contract test can boot ONE module
 * behind the same interceptors and the same exception filter the deployed app uses. A test that
 * rebuilt this list would be asserting parity against a pipeline nothing ships.
 */
export const REQUEST_PIPELINE_PROVIDERS: Provider[] = [
  { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
  { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  // Constructed, not `useClass`: its allowance argument is optional, and `emitDecoratorMetadata`
  // is off (tsx/esbuild cannot emit `design:paramtypes`), so DI cannot resolve an untokenised
  // parameter. Passing no allowance is the strict default — every mutation must be attributed.
  { provide: APP_INTERCEPTOR, useValue: new AuditActorInterceptor() },
  { provide: APP_FILTER, useClass: ApiExceptionFilter },
];

@Module({
  providers: REQUEST_PIPELINE_PROVIDERS,
  imports: [
    AccountModule,
    ActivityModule,
    AdminModule,
    AlertsModule,
    BriefsModule,
    CandidatesModule,
    CredentialsModule,
    CrmModule,
    DailyModule,
    DiscoverModule,
    HealthModule,
    InboundModule,
    JobsModule,
    LeadsModule,
    MentionsModule,
    MigrationModule,
    PipelineModule,
    PortalModule,
    ProspectsModule,
    ReportsModule,
    ResumeModule,
    RolesModule,
    SavedViewsModule,
    ScreeningModule,
    TemplatesModule,
    TenantsModule,
  ],
})
export class AppModule {}
