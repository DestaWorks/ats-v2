import { Global, Module } from "@nestjs/common";
import { jobQueue } from "@destaworks/jobs/runtime";
import { provideService } from "../service-token";
import { JOB_QUEUE } from "./jobs.tokens";

/**
 * Background jobs, as far as the API is concerned: one binding, no controllers.
 *
 * `jobQueue` is the lazy handle from `@destaworks/jobs/runtime`, not a driver — it resolves
 * whatever the process installed with `setJobQueue` at boot, and refuses with `FEATURE_DISABLED`
 * until something does. That keeps the driver decision out of every module that enqueues, and
 * keeps this API bootable in an environment that has no queue infrastructure at all: the routes
 * that enqueue answer 503, and nothing else is affected.
 *
 * `@Global` because "may I enqueue?" is not a domain boundary — every module will eventually have
 * one route that does, and threading an import through each of them would say nothing true.
 */
@Global()
@Module({
  providers: [provideService(JOB_QUEUE, jobQueue)],
  exports: [JOB_QUEUE],
})
export class JobsModule {}
