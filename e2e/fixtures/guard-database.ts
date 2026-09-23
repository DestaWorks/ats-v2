/** Refuses to run the destructive suite against anything but a disposable local database. */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0", "host.docker.internal"]);

export interface DatabaseGuardResult {
  ok: boolean;
  reason?: string;
  host?: string;
  database?: string;
}

export function checkDatabaseUrl(raw: string | undefined): DatabaseGuardResult {
  if (raw === undefined || raw.trim() === "") {
    return { ok: false, reason: "DATABASE_URL is not set" };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid connection string" };
  }

  const host = url.hostname;
  const database = url.pathname.replace(/^\//, "");

  if (!LOCAL_HOSTS.has(host)) {
    return {
      ok: false,
      host,
      database,
      reason: `refusing to run against a non-local database host "${host}"`,
    };
  }

  return { ok: true, host, database };
}

export function assertDisposableDatabase(
  env: Readonly<Record<string, string | undefined>> = process.env,
): void {
  const result = checkDatabaseUrl(env["DATABASE_URL"]);
  if (result.ok) return;

  throw new Error(
    [
      "",
      "  The end-to-end suite will not run against this database.",
      "",
      `  Reason: ${result.reason}`,
      result.host !== undefined ? `  Host:   ${result.host}` : "",
      result.database !== undefined ? `  DB:     ${result.database}` : "",
      "",
      "  This suite creates and deletes records and signs in repeatedly. It must only ever point",
      "  at a disposable local database.",
      "",
      "  Use `pnpm e2e:local`, which provisions a throwaway Postgres for the run.",
      "",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );
}
