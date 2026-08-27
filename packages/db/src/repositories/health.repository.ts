import { prisma } from "../prisma";

/**
 * The only DB dependency an uptime check actually needs: can we reach Postgres at all. A trivial
 * `SELECT 1` — no table access, no PII/PHI anywhere near this — costs nothing and proves the
 * connection pool (Supabase's transaction pooler) is actually up, not just that the Next.js
 * process itself is running.
 */
export const healthRepository = {
  async pingDatabase(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  },
};
