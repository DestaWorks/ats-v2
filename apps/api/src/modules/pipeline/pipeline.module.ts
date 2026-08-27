import { Module } from "@nestjs/common";
import { pipelineHealthService } from "@destaworks/application/pipeline-health.service";
import { provideService, serviceToken } from "../service-token";

export const PIPELINE_HEALTH_SERVICE =
  serviceToken<typeof pipelineHealthService>("PIPELINE_HEALTH_SERVICE");

/**
 * Pipeline health — stage-level aging, stalls and funnel conversion, keyed off the stable status
 * code and its `stage_order`, never the label string.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(PIPELINE_HEALTH_SERVICE, pipelineHealthService)],
  exports: [PIPELINE_HEALTH_SERVICE],
})
export class PipelineModule {}
