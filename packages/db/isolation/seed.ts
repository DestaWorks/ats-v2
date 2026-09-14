import type { Client } from "pg";

/**
 * Seeding for the isolation suite (SAAS-RESTRUCTURE-PLAN 6.7).
 *
 * The suite has to put a real row in each of the 39 tenant-scoped tables, for each of two tenants,
 * and every one of those tables has a different set of NOT NULL columns and foreign keys. Writing
 * 39 hand-made fixtures would work exactly once: the next migration that adds a NOT NULL column
 * breaks the seed, someone comments the table out, and the required check quietly stops covering
 * it. That is the specific way an isolation suite rots into a green tick.
 *
 * So the seed is derived from the database's own catalog instead. For each table it asks
 * `information_schema` which columns must be supplied and which of them are foreign keys, fills
 * the keys with the parent row already seeded for the SAME tenant, and gives everything else a
 * type-appropriate placeholder. A new column or a new table is covered the day it is added,
 * without anyone remembering to extend a fixture.
 *
 * Nothing here reads the Prisma client. The suite must prove that RLS holds for a query that
 * BYPASSES the enforcement seam, and it cannot do that through the seam.
 */

/** A column that must be supplied on INSERT: NOT NULL and with no database default. */
interface RequiredColumn {
  readonly name: string;
  /** The `pg_type` name — `text`, `int4`, `timestamp`, `jsonb`, `_text`, … */
  readonly type: string;
}

interface ForeignKey {
  readonly column: string;
  readonly parentTable: string;
}

interface TableShape {
  readonly required: readonly RequiredColumn[];
  readonly foreignKeys: readonly ForeignKey[];
}

const REQUIRED_COLUMNS_SQL = `
  SELECT column_name, udt_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = $1
    AND is_nullable = 'NO'
    AND column_default IS NULL
    AND is_generated = 'NEVER'
`;

const FOREIGN_KEYS_SQL = `
  SELECT
    att.attname       AS column_name,
    parent.relname    AS parent_table
  FROM pg_constraint con
  JOIN pg_class child   ON child.oid = con.conrelid
  JOIN pg_class parent  ON parent.oid = con.confrelid
  JOIN unnest(con.conkey) AS k(attnum) ON true
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
  WHERE con.contype = 'f' AND child.relname = $1
`;

export async function describeTable(client: Client, table: string): Promise<TableShape> {
  const required = await client.query<{ column_name: string; udt_name: string }>(
    REQUIRED_COLUMNS_SQL,
    [table],
  );
  const keys = await client.query<{ column_name: string; parent_table: string }>(FOREIGN_KEYS_SQL, [
    table,
  ]);
  return {
    required: required.rows.map((r) => ({ name: r.column_name, type: r.udt_name })),
    foreignKeys: keys.rows.map((r) => ({ column: r.column_name, parentTable: r.parent_table })),
  };
}

/**
 * A value that satisfies the column's type and is DIFFERENT for each tenant.
 *
 * Difference matters more than it looks. Several tables still carry a database-wide unique index
 * that ought to be per-tenant — `daily_briefs.date` and `weekly_briefs.weekStart` are the two the
 * plan's list of seven uniqueness rules missed — and identical placeholder text would collide
 * across the two tenants and fail the seed rather than the isolation assertion. Distinct values
 * keep the suite testing what it says it tests; the uniqueness defect is 6.2's to re-key.
 */
function placeholder(type: string, suffix: string): unknown {
  switch (type) {
    case "int2":
    case "int4":
    case "int8":
    case "numeric":
    case "float4":
    case "float8":
      return 0;
    case "bool":
      return false;
    case "timestamp":
    case "timestamptz":
    case "date":
      return new Date("2026-01-01T00:00:00.000Z");
    case "json":
    case "jsonb":
      return "{}";
    default:
      // Text and everything text-shaped, including the `String` columns Prisma uses for dates
      // ("YYYY-MM-DD"), enum-ish status codes and ids.
      return `seed-${suffix}`;
  }
}

/** Deterministic id for the one row this table gets in this tenant. */
export function rowId(table: string, suffix: string): string {
  return `${table}__${suffix}`;
}

/**
 * Insert one row into `table`, supplying every column the database insists on.
 *
 * `overrides` wins over everything: the caller uses it for the primary key, the tenant, and the
 * handful of columns whose value the assertions actually read.
 */
export async function insertRow(
  client: Client,
  table: string,
  suffix: string,
  overrides: Readonly<Record<string, unknown>>,
  parentId: (parentTable: string) => string | undefined,
): Promise<void> {
  const shape = await describeTable(client, table);
  const foreignKeyParent = new Map(shape.foreignKeys.map((fk) => [fk.column, fk.parentTable]));

  const values = new Map<string, unknown>();
  for (const column of shape.required) {
    const parent = foreignKeyParent.get(column.name);
    if (parent !== undefined) {
      const id = parentId(parent);
      // A required FK whose parent this seed does not know about would be a schema shape the
      // suite has not been taught. Failing here is right: silently skipping the column would
      // leave the table out of the proof.
      if (id === undefined) {
        throw new Error(`${table}.${column.name} references ${parent}, which was not seeded first`);
      }
      values.set(column.name, id);
      continue;
    }
    values.set(column.name, placeholder(column.type, suffix));
  }
  for (const [column, value] of Object.entries(overrides)) values.set(column, value);

  const columns = [...values.keys()];
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  await client.query(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders.join(", ")})`,
    [...values.values()],
  );
}

/**
 * Order the tables so a row's parents exist before it does.
 *
 * Derived from the catalog for the same reason the columns are: a new foreign key reorders the
 * seed by itself. Only NOT NULL keys create an edge — a nullable one is left NULL, which keeps
 * the graph acyclic without the suite needing to know which cycles the schema contains.
 */
export async function topologicalOrder(
  client: Client,
  tables: readonly string[],
): Promise<string[]> {
  const inScope = new Set(tables);
  const dependencies = new Map<string, Set<string>>();
  for (const table of tables) {
    const shape = await describeTable(client, table);
    const required = new Set(shape.required.map((c) => c.name));
    const parents = new Set(
      shape.foreignKeys
        .filter((fk) => required.has(fk.column) && inScope.has(fk.parentTable))
        .map((fk) => fk.parentTable),
    );
    parents.delete(table);
    dependencies.set(table, parents);
  }

  const ordered: string[] = [];
  const placed = new Set<string>();
  while (ordered.length < tables.length) {
    const next = tables.filter(
      (t) => !placed.has(t) && [...(dependencies.get(t) ?? [])].every((p) => placed.has(p)),
    );
    if (next.length === 0) {
      const stuck = tables.filter((t) => !placed.has(t));
      throw new Error(`Cycle among required foreign keys: ${stuck.join(", ")}`);
    }
    for (const table of next) {
      ordered.push(table);
      placed.add(table);
    }
  }
  return ordered;
}
