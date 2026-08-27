import "server-only";
import { healthRepository } from "@destaworks/db/repositories/health.repository";

export interface HealthCheckResult {
  ok: boolean;
  checks: {
    database: boolean;
  };
}

/**
 * Backs the public, unauthenticated `/api/health` endpoint — what an uptime monitor (Better
 * Stack or otherwise) pings on a schedule. Deliberately returns a plain ok/not-ok result rather
 * than throwing: a down database is an EXPECTED condition this exists to detect and report
 * cleanly (503), not an unhandled application bug (500) — the caller never sees a stack trace or
 * connection string either way.
 */
export const healthService = {
  async check(): Promise<HealthCheckResult> {
    const database = await healthRepository
      .pingDatabase()
      .then(() => true)
      .catch(() => false);
    return { ok: database, checks: { database } };
  },
};
