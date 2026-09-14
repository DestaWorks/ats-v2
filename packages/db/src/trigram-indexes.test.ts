import { readFileSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const MIGRATIONS_DIR = fileURLToPath(new URL("../prisma/migrations", import.meta.url));

const EXPECTED_TRIGRAM_INDEXES = [
  { name: "candidates_name_trgm_idx", table: "candidates", column: "name" },
  { name: "candidates_email_trgm_idx", table: "candidates", column: "email" },
  { name: "prospects_practicename_trgm_idx", table: "prospects", column: "practiceName" },
] as const;

const CREATE_TRIGRAM_INDEX =
  /create\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([A-Za-z0-9_]+)"?\s+on\s+(?:"?[A-Za-z0-9_]+"?\.)?"?([A-Za-z0-9_]+)"?\s+using\s+gin\s*\(\s*"?([A-Za-z0-9_]+)"?\s+gin_trgm_ops/gi;
const DROP_INDEX = /drop\s+index\s+(?:concurrently\s+)?(?:if\s+exists\s+)?"?([A-Za-z0-9_]+)"?/gi;
const CREATE_PG_TRGM = /create\s+extension\s+(?:if\s+not\s+exists\s+)?"?pg_trgm"?/i;

function stripSqlComments(sql: string) {
  return sql.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => ({
      name,
      sql: stripSqlComments(readFileSync(`${MIGRATIONS_DIR}/${name}/migration.sql`, "utf8")),
    }));
}

type IndexState = { table: string; column: string; migration: string };

function replayTrigramIndexes() {
  const live = new Map<string, IndexState>();
  const lastDroppedBy = new Map<string, string>();
  let extensionCreatedBy: string | null = null;

  for (const { name, sql } of migrationFiles()) {
    if (extensionCreatedBy === null && CREATE_PG_TRGM.test(sql)) extensionCreatedBy = name;

    for (const [, index] of sql.matchAll(DROP_INDEX)) {
      if (index && live.delete(index)) lastDroppedBy.set(index, name);
    }
    for (const [, index, table, column] of sql.matchAll(CREATE_TRIGRAM_INDEX)) {
      if (index && table && column) live.set(index, { table, column, migration: name });
    }
  }

  return { live, lastDroppedBy, extensionCreatedBy };
}

describe("pg_trgm search indexes survive the migration set", () => {
  const { live, lastDroppedBy, extensionCreatedBy } = replayTrigramIndexes();

  it("creates the pg_trgm extension", () => {
    expect(
      extensionCreatedBy,
      "No migration runs CREATE EXTENSION pg_trgm — the GIN trigram indexes cannot exist without it.",
    ).not.toBeNull();
  });

  it.each(EXPECTED_TRIGRAM_INDEXES)(
    "$name still exists on $table($column) after replaying every migration in order",
    ({ name, table, column }) => {
      const state = live.get(name);
      const dropped = lastDroppedBy.get(name);
      expect(
        state,
        dropped
          ? `"${name}" is dropped by prisma/migrations/${dropped}/migration.sql and never recreated. ` +
              `This index is deliberately NOT declared in schema.prisma, so \`prisma migrate dev\` proposes ` +
              `dropping it as drift. Generate schema migrations with \`prisma migrate dev --create-only\`, ` +
              `delete the unwanted DROP INDEX lines, or add a follow-up migration that recreates it.`
          : `"${name}" is never created by any migration.`,
      ).toBeDefined();
      expect(state?.table).toBe(table);
      expect(state?.column).toBe(column);
    },
  );
});
