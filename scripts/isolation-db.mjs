#!/usr/bin/env node
/**
 * Give the isolation suite a real Postgres, then run it (SAAS-RESTRUCTURE-PLAN 6.7).
 *
 * "A test suite that cannot run without a database is not a required check" — so this makes the
 * database part of the command rather than part of the setup instructions. Two shapes:
 *
 *  - CI, and anyone who already has a disposable Postgres: `ISOLATION_DATABASE_URL` is set, this
 *    script uses it. The workflow supplies a `postgres:16` service container.
 *  - A developer with Postgres installed but no container runtime: no URL, so this initialises a
 *    brand-new cluster in a temp directory on a random loopback port, runs against it, and deletes
 *    it. Nothing outside that directory is touched, and the cluster never outlives the command.
 *
 * Either way the schema is built by replaying the migration SQL (`apply-migrations.mjs`), never by
 * the Prisma CLI — see that file for why.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { appConnectionString } from "./isolation-role.mjs";

const DB_NAME = "destaworks_isolation";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error?.code === "ENOENT") return { missing: true, status: 127 };
  return { missing: false, status: result.status ?? 1 };
}

/** A port nothing is listening on right now. Races are possible and harmless: the cluster fails to
 *  start, the command fails loudly, and a re-run picks another. */
function freePort() {
  const server = net.createServer();
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function withEphemeralCluster(body) {
  const dataDir = mkdtempSync(join(tmpdir(), "destaworks-isolation-"));
  const port = await freePort();

  const init = run("initdb", ["-D", dataDir, "-U", "postgres", "--auth=trust", "--no-sync"], {
    stdio: "ignore",
  });
  if (init.missing) {
    console.error(
      "No `initdb` on PATH, and ISOLATION_DATABASE_URL is not set.\n" +
        "The isolation suite needs a real Postgres. Either install Postgres (macOS: " +
        "`brew install postgresql@16`), or point ISOLATION_DATABASE_URL at a throwaway database.",
    );
    rmSync(dataDir, { recursive: true, force: true });
    return 1;
  }
  if (init.status !== 0) {
    rmSync(dataDir, { recursive: true, force: true });
    return init.status;
  }

  const started = run(
    "pg_ctl",
    [
      "-D",
      dataDir,
      "-o",
      `-p ${port} -h 127.0.0.1`,
      "-w",
      "-l",
      join(dataDir, "server.log"),
      "start",
    ],
    { stdio: "ignore" },
  );
  if (started.status !== 0) {
    rmSync(dataDir, { recursive: true, force: true });
    return started.status;
  }

  try {
    const created = run(
      "createdb",
      ["-h", "127.0.0.1", "-p", String(port), "-U", "postgres", DB_NAME],
      {
        stdio: "ignore",
      },
    );
    if (created.status !== 0) return created.status;
    return await body(`postgresql://postgres@127.0.0.1:${port}/${DB_NAME}`);
  } finally {
    run("pg_ctl", ["-D", dataDir, "-m", "immediate", "stop"], { stdio: "ignore" });
    rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main(url) {
  // `apply-migrations.mjs` builds the schema with the admin connection and then hands ownership to
  // an unprivileged role; the suite gets the unprivileged URL, because policies do not apply to a
  // superuser and a suite that ran as one would prove nothing. See `isolation-role.mjs`.
  const migrated = run("node", ["scripts/apply-migrations.mjs"], {
    env: { ...process.env, ISOLATION_DATABASE_URL: url },
  });
  if (migrated.status !== 0) return migrated.status;
  // DATABASE_URL too, because `seam.test.ts` drives the real Prisma client through the real
  // policies. Same unprivileged role, same throwaway database.
  const appUrl = appConnectionString(url);
  const tested = run("pnpm", ["exec", "vitest", "run", "--config", "vitest.isolation.config.ts"], {
    env: { ...process.env, ISOLATION_DATABASE_URL: appUrl, DATABASE_URL: appUrl },
  });
  return tested.status;
}

const existing = process.env.ISOLATION_DATABASE_URL;
const status = existing ? await main(existing) : await withEphemeralCluster(main);
process.exit(status);
