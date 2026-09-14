import { logger } from "@destaworks/config/logger";
import { installNodeLogger } from "@destaworks/config/logger/install";
import { inspectJobs, logJobHealth, retryDeadLettered } from "@destaworks/jobs/observability";
import { REGISTERED_JOBS } from "@destaworks/jobs/registered-jobs";
import { createBossClient } from "@destaworks/jobs/runtime/boss";

/**
 * The operator's hands on the queue: `pnpm jobs status` and `pnpm jobs retry <job> [limit]`.
 *
 * This is what turns the Phase 5 done-when — "a failed job is visible and retryable" — into
 * something a person can do at 2am, rather than a property of the code. A script and not an HTTP
 * route on purpose: replaying dead-lettered work is a deliberate act taken *after* the cause has
 * been fixed, it needs no UI, and giving it an endpoint would mean inventing a capability in the
 * shared role vocabulary for a button nobody has asked for.
 *
 * It connects in the `sender` role, so running it never migrates the schema and never competes
 * with the worker for the maintenance lock. Its output goes through the same structured logger as
 * everything else, so a run leaves the same kind of trace an incident review can read.
 */
const DEFAULT_RETRY_LIMIT = 100;

async function main(): Promise<void> {
  installNodeLogger();
  const [command, jobName, rawLimit] = process.argv.slice(2);
  const boss = createBossClient({ role: "sender" });
  await boss.start();

  try {
    if (command === "status") {
      logJobHealth(await inspectJobs(boss, REGISTERED_JOBS));
      return;
    }

    if (command === "retry") {
      const job = REGISTERED_JOBS.find((candidate) => candidate.name === jobName);
      if (!job) {
        logger.error("jobs.cli_unknown_job", {
          requested: jobName ?? "",
          known: REGISTERED_JOBS.map((entry) => entry.name),
        });
        process.exitCode = 1;
        return;
      }
      const limit = Number.parseInt(rawLimit ?? "", 10);
      await retryDeadLettered(
        boss,
        job,
        Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_RETRY_LIMIT,
      );
      return;
    }

    logger.error("jobs.cli_usage", { usage: "jobs status | jobs retry <job> [limit]" });
    process.exitCode = 1;
  } finally {
    await boss.stop({ close: true });
  }
}

await main();
