import { pipelineHealthService } from "@destaworks/application/pipeline-health.service";
import { serviceToken } from "../service-token";

/**
 * The pipeline-health injection token, kept out of `pipeline.module.ts` so the module can import
 * its controller and the controller can name the token without an ES module cycle — `@Inject`
 * evaluates at class-definition time, so a cycle here is a boot-time ReferenceError, not a warning.
 */
export const PIPELINE_HEALTH_SERVICE =
  serviceToken<typeof pipelineHealthService>("PIPELINE_HEALTH_SERVICE");
