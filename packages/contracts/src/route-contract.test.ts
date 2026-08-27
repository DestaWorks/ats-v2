import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The contract rules of SAAS-RESTRUCTURE-PLAN "Engineering standards → API contracts":
 * every endpoint declares its request and response types; no endpoint returns a raw
 * database row; no endpoint returns a type defined by omission from a model.
 *
 * Phase 0.4 and 0.7 made all of this true by hand. This is what keeps it true.
 */

/** Every application that serves an App Router API. `apps/*` so a second app is covered on arrival. */
const APPS_DIR = "apps";

/** Trees holding first-party source. */
const SOURCE_ROOTS = ["apps", "packages", "src"];

/**
 * `packages/db` owns the Prisma models, so an `Omit<Model, …>` there is a query shape — the set of
 * columns a repository selected — not a wire shape. It is the one tree the omission rule skips, and
 * `never exports a wire shape` below is the fence that keeps the skip from becoming a hole.
 */
const OMISSION_RULE_SKIPS = "packages/db/";

/** Prisma's generated client is machine-written and full of internal `Omit<...>`; never first-party. */
const GENERATED = "generated";

const PRISMA_SCHEMA = "packages/db/prisma/schema.prisma";

/** `Method` → the prefix its response type must carry, e.g. `DELETE` → `DeleteLeadResponse`. */
const METHOD_PREFIX = {
  GET: "Get",
  POST: "Post",
  PUT: "Put",
  PATCH: "Patch",
  DELETE: "Delete",
} as const;

type Method = keyof typeof METHOD_PREFIX;

const METHODS = Object.keys(METHOD_PREFIX) as Method[];

/**
 * The two endpoints that legitimately never return through `json<T>()`. Named, with the reason
 * and the marker that proves the reason still holds — a silent skip would let a real JSON
 * endpoint hide behind an exemption. `mustContain` fails the exemption if the file stops being
 * what it claims to be; `mustNotCallJson` fails it the moment a JSON response is added.
 */
const RESPONSE_TYPE_EXEMPTIONS = [
  {
    path: "apps/web/src/app/api/auth/[...all]/route.ts",
    reason:
      "Better Auth catch-all: GET/POST are re-exported from toNextJsHandler(auth) and never " +
      "return through json(). The wire shapes are Better Auth's, not ours to declare.",
    mustContain: "toNextJsHandler",
  },
  {
    path: "apps/web/src/app/api/reports/export/route.ts",
    reason:
      "CSV export: responds text/csv as a file download, not JSON. There is no response type " +
      "to declare because there is no JSON body.",
    mustContain: "text/csv",
  },
] as const;

const EXEMPT_PATHS = new Set<string>(RESPONSE_TYPE_EXEMPTIONS.map((e) => e.path));

function filesUnder(dir: string, matches: (name: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === GENERATED || entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) filesUnder(full, matches, out);
    else if (matches(entry)) out.push(full);
  }
  return out;
}

/** Every `route.ts` under every app's `src/app/api`, in POSIX-separated repo-relative form. */
function routeFiles(): string[] {
  if (!existsSync(APPS_DIR)) return [];
  return readdirSync(APPS_DIR)
    .flatMap((app) => filesUnder(join(APPS_DIR, app, "src", "app", "api"), (n) => n === "route.ts"))
    .map((p) => p.split(/[\\/]/).join("/"))
    .sort();
}

/** HTTP methods a route file exports, including the destructured `export const { GET, POST }` form. */
function exportedMethods(src: string): Method[] {
  const found = new Set<Method>();
  for (const m of src.matchAll(
    /^export\s+(?:const|async\s+function|function)\s+(GET|POST|PUT|PATCH|DELETE)\b/gm,
  )) {
    found.add(m[1] as Method);
  }
  for (const m of src.matchAll(/^export\s+const\s+\{([^}]*)\}/gm)) {
    for (const name of (m[1] ?? "").split(",").map((s) => s.trim())) {
      if ((METHODS as string[]).includes(name)) found.add(name as Method);
    }
  }
  return [...found];
}

/** Response type names the file exports — the declared wire shapes. */
function exportedResponseTypes(src: string): string[] {
  return [...src.matchAll(/^export\s+(?:type|interface)\s+([A-Za-z0-9_]+Response)\b/gm)].map(
    (m) => m[1] as string,
  );
}

/** Calls to the `json` helper, split by whether they carry an explicit type argument. */
function jsonCalls(src: string): { typed: string[]; untyped: number } {
  const typed = [...src.matchAll(/(?<![.\w])json\s*<([^<>]+)>\s*\(/g)].map((m) =>
    (m[1] as string).trim(),
  );
  const untyped = [...src.matchAll(/(?<![.\w])json\s*\(/g)].length;
  return { typed, untyped };
}

describe("every endpoint declares its request and response types", () => {
  const routes = routeFiles();

  it("finds the API surface", () => {
    expect(routes.length).toBeGreaterThanOrEqual(138);
  });

  it("exports a <Method><Resource>Response per handler and passes it to json<T>()", () => {
    const offenders: string[] = [];

    for (const file of routes) {
      if (EXEMPT_PATHS.has(file)) continue;
      const src = readFileSync(file, "utf8");
      const declared = exportedResponseTypes(src);
      const { typed, untyped } = jsonCalls(src);

      if (untyped > 0) {
        offenders.push(`${file}: ${untyped} json(...) call(s) with no explicit response type`);
      }

      for (const method of exportedMethods(src)) {
        const prefix = METHOD_PREFIX[method];
        const naming = new RegExp(`^${prefix}[A-Z0-9]`);
        if (!declared.some((t) => naming.test(t))) {
          offenders.push(
            `${file}: ${method} declares no exported ${prefix}<Resource>Response type`,
          );
        }
      }

      for (const arg of typed) {
        for (const member of arg.split("|").map((s) => s.trim())) {
          if (!declared.includes(member)) {
            offenders.push(`${file}: json<${member}> is not a response type this route exports`);
          }
        }
      }
    }

    expect(
      offenders,
      `endpoints with an undeclared response type:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("validates every request body against a @destaworks/contracts schema", () => {
    const offenders: string[] = [];

    for (const file of routes) {
      if (EXEMPT_PATHS.has(file)) continue;
      const src = readFileSync(file, "utf8");
      const lines = src.split("\n");
      const readsBody = /(?:req|request)\.(?:json|formData)\s*\(\s*\)/;

      lines.forEach((line, i) => {
        if (!readsBody.test(line)) return;
        const statement = lines.slice(Math.max(0, i - 2), i + 2).join(" ");
        if (!/\.(?:safeParse|parse)\s*\(/.test(statement)) {
          offenders.push(`${file}:${i + 1}: request body consumed without a schema parse`);
        }
      });

      if (readsBody.test(src) && !src.includes("@destaworks/contracts")) {
        offenders.push(`${file}: reads a request body but imports no @destaworks/contracts schema`);
      }
    }

    expect(
      offenders,
      `endpoints with an undeclared request type:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps every exemption earned", () => {
    const offenders: string[] = [];

    for (const exemption of RESPONSE_TYPE_EXEMPTIONS) {
      if (!existsSync(exemption.path)) {
        offenders.push(`${exemption.path}: exempted route no longer exists — drop the exemption`);
        continue;
      }
      const src = readFileSync(exemption.path, "utf8");
      if (!src.includes(exemption.mustContain)) {
        offenders.push(
          `${exemption.path}: no longer contains "${exemption.mustContain}" — the exemption ` +
            `reason ("${exemption.reason}") no longer holds`,
        );
      }
      if (jsonCalls(src).typed.length + jsonCalls(src).untyped > 0) {
        offenders.push(
          `${exemption.path}: now returns JSON through json() — it must declare response types ` +
            `like every other endpoint, not shelter under its exemption`,
        );
      }
    }

    expect(offenders, `stale contract exemptions:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("no endpoint returns a raw database row", () => {
  /** Model names straight from the schema, so a new model is covered without editing this test. */
  function prismaModels(): string[] {
    const schema = readFileSync(PRISMA_SCHEMA, "utf8");
    return [...schema.matchAll(/^model\s+([A-Za-z0-9_]+)\s*\{/gm)].map((m) => m[1] as string);
  }

  it("reads the model list from the Prisma schema", () => {
    expect(prismaModels().length).toBeGreaterThanOrEqual(41);
  });

  it("defines no exposed type by omission from a database model", () => {
    const models = prismaModels();
    const files = SOURCE_ROOTS.flatMap((root) =>
      filesUnder(root, (n) => /\.tsx?$/.test(n) && !/\.(?:test|spec)\.tsx?$/.test(n)),
    )
      .map((p) => p.split(/[\\/]/).join("/"))
      .filter((p) => !p.startsWith(OMISSION_RULE_SKIPS));
    expect(files.length).toBeGreaterThan(200);

    const offenders: string[] = [];
    /** `Omit<Foo` / `Omit<Prisma.Foo` — the operand is what decides, not the formatting. */
    const omitCall = /\bOmit\s*<\s*(?:Prisma\.)?([A-Za-z0-9_]+)/g;

    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("Omit<")) continue;
      for (const match of src.matchAll(omitCall)) {
        const operand = match[1] as string;
        const isModelDerived = models.includes(operand) || /Row$/.test(operand);
        if (!isModelDerived) continue;
        const line = src.slice(0, match.index).split("\n").length;
        offenders.push(
          `${file}:${line}: Omit<${operand}, ...> — a wire shape defined by omission from a ` +
            `database model. List the published fields explicitly (Pick<${operand}, …>) so a new ` +
            `column is exposed to nobody until someone names it.`,
        );
      }
    }

    expect(offenders, `types defined by omission from a model:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("never exports a wire shape from the database package", () => {
    const offenders: string[] = [];

    for (const file of filesUnder("packages/db/src", (n) => /\.ts$/.test(n))) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(
        /^export\s+(?:type|interface)\s+([A-Za-z0-9_]+(?:DTO|Response))\b/gm,
      )) {
        const line = src.slice(0, match.index).split("\n").length;
        offenders.push(
          `${file}:${line}: exports ${match[1]} — wire shapes belong in @destaworks/contracts or the ` +
            `DTO layer, where the omission rule applies. packages/db is exempt from that rule ` +
            `because it holds query shapes only.`,
        );
      }
    }

    expect(offenders, `wire shapes inside the database package:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });

  it("keeps the database package out of route handlers", () => {
    const offenders: string[] = [];

    for (const file of routeFiles()) {
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/from\s+["'](@destaworks\/db[^"']*|@prisma\/client)["']/g)) {
        const line = src.slice(0, match.index).split("\n").length;
        offenders.push(
          `${file}:${line}: imports ${match[1]} — a handler that can name a repository row can ` +
            `return one. Routes go through a service and return a DTO.`,
        );
      }
    }

    expect(offenders, `routes reaching the database directly:\n${offenders.join("\n")}`).toEqual(
      [],
    );
  });
});
