import { Prisma } from "../generated/prisma/client";
import { db } from "../prisma";

/** Postgres' unique-violation code — the losing side of a claim race, not an error condition. */
const UNIQUE_VIOLATION = "P2002";

export const scheduleRunRepository = {
  /**
   * Claim one occurrence of one schedule for this worker, returning whether the claim was won.
   *
   * The insert IS the lock: `@@unique([schedule, occurrenceAt])` means N workers racing on the
   * same occurrence produce one insert and N-1 unique violations, decided by Postgres rather than
   * by anything in this process. No advisory lock, no read-then-write window, no leader election.
   */
  async claim(schedule: string, occurrenceAt: Date): Promise<boolean> {
    try {
      await db().scheduleRun.create({ data: { schedule, occurrenceAt } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === UNIQUE_VIOLATION) {
        return false;
      }
      throw err;
    }
  },

  /**
   * Give a won claim back, so a later tick inside the catch-up window may retry it.
   *
   * Only called when the enqueue that the claim was taken for failed. Without it a transient
   * queue outage would silently swallow that occurrence until the next day's one comes round.
   */
  async release(schedule: string, occurrenceAt: Date): Promise<void> {
    await db().scheduleRun.deleteMany({ where: { schedule, occurrenceAt } });
  },
};
