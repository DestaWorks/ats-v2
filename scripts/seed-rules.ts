import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { BASE_CLIENT_RULES } from "@/lib/constants";

/**
 * Seed the `client_rules` table from `BASE_CLIENT_RULES` (DATA, not code — DECISIONS). Idempotent:
 * upserts by the resolved `clientId` (the 1:1 key), so re-runs update in place rather than duplicate.
 * Resolves `clientId` from the seeded `clients` by `name` (== legacyId for all `BASE_CLIENTS`), so it
 * MUST run AFTER `db:seed:clients`. A missing client is skipped with a warning, not a hard failure.
 */
async function main() {
  for (const r of BASE_CLIENT_RULES) {
    const client = await prisma.client.findFirst({ where: { name: r.clientName } });
    if (!client) {
      console.warn(
        `⚠ Skipped rules for "${r.clientName}" — client not found (run db:seed:clients first)`,
      );
      continue;
    }
    const data = {
      states: [...r.states],
      creds: [...r.creds],
      pops: [...r.pops],
      settings: [...r.settings],
      schedule: r.schedule,
      priority: r.priority,
      autoDisqualify: [...r.autoDisqualify],
    };
    await prisma.clientRules.upsert({
      where: { clientId: client.id },
      create: { clientId: client.id, ...data },
      update: data,
    });
    console.log(`✓ Seeded rules: ${r.clientName}`);
  }
  console.log(`Done — ${BASE_CLIENT_RULES.length} client-rules upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
