import "dotenv/config";
import { prisma } from "@destaworks/db/prisma";

/**
 * Print a user's id, and nothing else, to stdout — for CI to capture via command substitution.
 *
 * `PLATFORM_ADMIN_USER_IDS` (`packages/auth/src/platform-admin.ts`) can only ever name an account
 * id that already exists, by design (6.8: no application path lets anyone choose one). The e2e
 * job needs the seeded Owner's real, database-assigned id to grant it the platform-admin plane
 * for the platform-tenants-console spec, and a `cuid` can't be predicted ahead of seeding it —
 * this is that lookup.
 *
 * Usage: tsx scripts/print-user-id.ts <email>
 */
async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: tsx scripts/print-user-id.ts <email>");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`No user found for ${email}`);
    process.exit(1);
  }
  process.stdout.write(user.id);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
