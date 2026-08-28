import { Module } from "@nestjs/common";
import { pipelineHealthService } from "@destaworks/application/pipeline-health.service";
import { provideService } from "../service-token";
import { PipelineController } from "./pipeline.controller";
import { PIPELINE_HEALTH_SERVICE } from "./pipeline.tokens";

export { PIPELINE_HEALTH_SERVICE };

/** The AI Pipeline Health strip — one team-wide read of how the pipeline is doing right now. */
@Module({
  controllers: [PipelineController],
  providers: [provideService(PIPELINE_HEALTH_SERVICE, pipelineHealthService)],
  exports: [PIPELINE_HEALTH_SERVICE],
})
export class PipelineModule {}
