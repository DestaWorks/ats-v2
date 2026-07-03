import "dotenv/config";
import { prisma } from "@/server/db/prisma";
import { BASE_CLIENTS } from "@/lib/constants";

/**
 * Seed the `clients` table from `BASE_CLIENTS` (DATA-MODEL). Idempotent — upserts by the
 * stable `legacyId` (the free-text client name the legacy Sheet used), so it is safe to
 * re-run and lines up with the one-shot Sheet→Postgres ETL.
 */
async function main() {
  for (const client of BASE_CLIENTS) {
    await prisma.client.upsert({
      where: { legacyId: client.legacyId },
      create: { legacyId: client.legacyId, name: client.name, capacity: client.capacity },
      update: { name: client.name, capacity: client.capacity },
    });
    console.log(`✓ Seeded client: ${client.name}`);
  }
  console.log(`Done — ${BASE_CLIENTS.length} base clients upserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
