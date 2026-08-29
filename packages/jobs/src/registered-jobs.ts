import { defineJob, type RegisteredJob } from "./registry";
import { generateDailyBriefJob, generateWeeklyBriefJob } from "./definitions/briefs";
import { generateDailyBriefHandler, generateWeeklyBriefHandler } from "./handlers/briefs";
import { reportExportJob } from "./definitions/report-export.job";
import { reportExportHandler } from "./handlers/report-export.handler";
import { migrationCommitJob, handleMigrationCommit } from "./queues/migration-commit.job";

/**
 * Every job this system can run.
 *
 * One list, and it is the only one: the worker subscribes to exactly these, the queue driver
 * provisions exactly these, and `inspectJobs` reports on exactly these. A job that is not here is
 * enqueueable and will sit in the queue forever, so adding a handler means adding it here in the
 * same change.
 *
 * Add an entry as `defineJob(theDefinition, theHandler)` from the job's own module — not the
 * definition alone, which is what makes the handler's absence a compile error rather than a
 * silently idle queue.
 */
export const REGISTERED_JOBS: readonly RegisteredJob[] = [
  defineJob(generateDailyBriefJob, generateDailyBriefHandler),
  defineJob(generateWeeklyBriefJob, generateWeeklyBriefHandler),
  defineJob(reportExportJob, reportExportHandler),
  defineJob(migrationCommitJob, handleMigrationCommit),
];

/** Lookup by queue name, for the operator CLI and the scheduler. */
export function jobByName(name: string): RegisteredJob | undefined {
  return REGISTERED_JOBS.find((job) => job.name === name);
}
