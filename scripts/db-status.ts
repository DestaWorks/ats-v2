import "dotenv/config";
import { prisma } from "../src/server/db/prisma";

/** Quick dev utility: how much data is in the connected DB? `pnpm db:status`. */
async function main() {
  const [users, clients, candidates, documents] = await Promise.all([
    prisma.user.count(),
    prisma.client.count(),
    prisma.candidate.count(),
    prisma.document.count(),
  ]);
  const owners = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(JSON.stringify({ users, clients, candidates, documents, accounts: owners }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
