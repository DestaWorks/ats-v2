/**
 * The database role the isolation suite connects as, and why it is not the one that built the
 * schema.
 *
 * ROW-LEVEL SECURITY DOES NOT APPLY TO EVERYONE
 *
 * Postgres exempts two kinds of connection from every policy:
 *
 *   - a SUPERUSER, and any role with the BYPASSRLS attribute, unconditionally;
 *   - the table's OWNER, unless the table is also `FORCE`d.
 *
 * A suite that connected as the superuser that created the tables would watch all 195 assertions
 * pass with the policies doing nothing whatsoever, and would keep passing if the policies were
 * deleted. That is precisely the "green check that tests nothing" this phase exists to avoid — and
 * it is not hypothetical: the first run of this suite did exactly that.
 *
 * So the schema is built by the admin connection, ownership is then handed to this ordinary role,
 * and the suite connects as it. `FORCE ROW LEVEL SECURITY` in the RLS migration is what binds an
 * owner, which mirrors production: on Supabase the application connects as the role that owns
 * these tables.
 *
 * The corresponding PRODUCTION requirement, which no test can check from here: the role in
 * `DATABASE_URL` must be neither a superuser nor `BYPASSRLS`. The suite asserts its own connection
 * satisfies that, so at least the proof is known to be a real proof.
 */
export const APP_ROLE = "destaworks_rls_app";
export const APP_PASSWORD = "isolation-suite-only";

/** The same database, reached as the unprivileged application role. */
export function appConnectionString(adminUrl) {
  const url = new URL(adminUrl);
  url.username = APP_ROLE;
  url.password = APP_PASSWORD;
  return url.toString();
}

/**
 * Create the role if it is missing and give it the schema, then hand it every table.
 *
 * Ownership rather than a bare GRANT because that is the production shape: the app owns its
 * tables, and `FORCE` is the only reason a policy applies to it. Granting DML to a non-owner would
 * test a configuration we do not run.
 */
export async function ensureAppRole(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${APP_ROLE}') THEN
        CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB;
      END IF;
    END
    $$;
  `);
  await client.query(`GRANT ALL ON SCHEMA public TO ${APP_ROLE}`);
  const tables = await client.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  for (const { tablename } of tables.rows) {
    await client.query(`ALTER TABLE "${tablename}" OWNER TO ${APP_ROLE}`);
  }
}
