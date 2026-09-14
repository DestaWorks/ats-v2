#!/usr/bin/env node
// Every `@RequireModule` must sit under a guard that enforces it.
//
// The decorator writes metadata; something has to read it. Only `SessionAuthGuard` and
// `CapabilityGuard` do. A module gate under any other guard looks gated in review and sells the
// feature for free. A per-route test asserts what a route DOES; this asserts what none may OMIT.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/** The guards whose `canActivate` calls `enforceDeclaredModule`. */
const ENFORCING_GUARDS = ["SessionAuthGuard", "CapabilityGuard"];

const ENFORCER = "apps/api/src/common/guards/module-entitlement.ts";

const files = execSync("find apps/api/src -name '*.controller.ts' -not -name '*.test.ts'")
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);

const failures = [];
let gated = 0;

for (const file of files) {
  const src = readFileSync(file, "utf8");
  const declared = [...src.matchAll(/@RequireModule\(\s*["']([a-z]+)["']\s*\)/g)];
  if (declared.length === 0) continue;
  gated += declared.length;

  const guards = [...src.matchAll(/@UseGuards\(([^)]*)\)/g)].flatMap((m) =>
    m[1].split(",").map((g) => g.trim()),
  );
  const enforcing = guards.filter((g) => ENFORCING_GUARDS.includes(g));
  if (enforcing.length === 0) {
    failures.push(
      `${file}\n    declares @RequireModule("${declared[0][1]}") but attaches no guard that reads it.` +
        `\n    Guards found: ${guards.length ? guards.join(", ") : "(none)"}` +
        `\n    Add one of: ${ENFORCING_GUARDS.join(", ")}`,
    );
  }
}

// Remove the call and every gate above goes quiet at once.
for (const guard of ["session-auth.guard.ts", "capability.guard.ts"]) {
  const path = `apps/api/src/common/guards/${guard}`;
  // The CALL, not the import: a substring match passes with the call deleted.
  if (!/enforceDeclaredModule\s*\(/.test(readFileSync(path, "utf8"))) {
    failures.push(
      `${path}\n    no longer calls enforceDeclaredModule — every @RequireModule is now inert.`,
    );
  }
}

if (!/assertModule\s*\(/.test(readFileSync(ENFORCER, "utf8"))) {
  failures.push(
    `${ENFORCER}\n    no longer calls assertModule — the entitlement check does nothing.`,
  );
}

// A floor, so deleting the gates cannot turn this check into a no-op that still reports success.
const MINIMUM_GATED = 20;
if (gated < MINIMUM_GATED) {
  failures.push(
    `Only ${gated} module gate(s) found, expected at least ${MINIMUM_GATED}.\n` +
      `    Either gates were removed, or this check has stopped seeing them.`,
  );
}

if (failures.length > 0) {
  console.error("Module entitlement check FAILED\n");
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(`Module entitlement check passed — ${gated} gates, all behind an enforcing guard.`);
