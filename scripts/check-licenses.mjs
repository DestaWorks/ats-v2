/**
 * Third-party licence gate + SBOM generator (PROJECT-CONTEXT.md, NDA §5b).
 *
 * The obligation is contractual, not stylistic: **permissive licences only — no GPL, LGPL or AGPL
 * without the Owner's prior written consent** — plus a maintained record of third-party components
 * that can be produced on request. Until now neither existed, and a convention nothing enforces is
 * a convention that drifts.
 *
 * Data comes from `pnpm licenses list --json --prod`, so there is no new dependency and no second
 * view of the dependency graph: it is pnpm's own resolution of the same lockfile CI installs from.
 *
 *   pnpm license:check    verify, and fail on anything forbidden or unreviewed
 *   pnpm license:sbom     regenerate docs/THIRD-PARTY-LICENSES.md
 *
 * A dual licence (`(MIT OR GPL-3.0-or-later)`) is satisfied by its permissive half — you take the
 * MIT terms — so those pass without an exception.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

/** Licences that need no review. */
const PERMISSIVE = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "Unlicense",
  "CC0-1.0",
  "WTFPL",
  "Python-2.0",
  "Zlib",
]);

/**
 * Everything else is refused unless it is listed HERE, with a reason, by a human.
 *
 * This is the whole point of the gate: a licence outside `PERMISSIVE` stops the build until
 * somebody writes down why it is acceptable. "It was already there" is not a reason — several of
 * these predate the check and are recorded as findings rather than as approvals.
 */
const REVIEWED = {
  "LGPL-3.0-or-later": {
    verdict: "NEEDS OWNER CONSENT",
    reason:
      "libvips, pulled in by `sharp` for Next.js image optimisation. NDA §5b names LGPL as " +
      "requiring the Owner's PRIOR WRITTEN CONSENT. It is used unmodified and loaded as a shared " +
      "library rather than linked into our code, which is the usual basis for accepting LGPL — " +
      "but that judgement is the Owner's to make, not ours. Recorded, not approved.",
  },
  "MPL-2.0": {
    verdict: "accepted",
    reason:
      "File-level copyleft: it reaches modified MPL files only, never the code that imports them. " +
      "`lightningcss` and `axe-core` are used unmodified, so nothing of ours is affected.",
  },
  "FSL-1.1-MIT": {
    verdict: "accepted",
    reason:
      "`@sentry/cli`, a build-time tool that ships in no runtime image. The Functional Source " +
      "License forbids building a competing product with it and converts to MIT after two years; " +
      "neither restriction touches this app.",
  },
  "CC-BY-4.0": {
    verdict: "accepted",
    reason: "`caniuse-lite` — a browser-support DATA set, not code. Attribution only.",
  },
  "(AFL-2.1 OR BSD-3-Clause)": {
    verdict: "accepted",
    reason: "Dual licensed; taken under BSD-3-Clause, which is permissive.",
  },
};

/**
 * Evaluate an SPDX expression against `PERMISSIVE`.
 *
 * `OR` is a choice — `(MIT OR GPL-3.0-or-later)` is fine because you may take the MIT terms.
 * `AND` is cumulative — `(MIT AND Zlib)` binds you to BOTH, so every term has to be permissive.
 * Anything this cannot satisfy falls through to `REVIEWED`, where a human has to write down why.
 */
function isPermissiveExpression(expression) {
  const alternatives = expression
    .replace(/^\(|\)$/g, "")
    .split(/\s+OR\s+/i)
    .map((alt) => alt.trim());
  return alternatives.some((alt) =>
    alt
      .replace(/^\(|\)$/g, "")
      .split(/\s+AND\s+/i)
      .map((term) => term.trim())
      .every((term) => PERMISSIVE.has(term)),
  );
}

function classify(expression) {
  if (PERMISSIVE.has(expression)) return { ok: true };
  if (isPermissiveExpression(expression)) {
    return { ok: true, note: "compound expression satisfied entirely by permissive terms" };
  }
  const reviewed = REVIEWED[expression];
  if (reviewed) return { ok: reviewed.verdict !== "FORBIDDEN", reviewed };
  return { ok: false };
}

function read() {
  const raw = execFileSync("pnpm", ["licenses", "list", "--json", "--prod"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(raw);
}

const byLicense = read();
const write = process.argv.includes("--write");

const failures = [];
const consent = [];
let packageCount = 0;

for (const [expression, packages] of Object.entries(byLicense)) {
  packageCount += packages.length;
  const verdict = classify(expression);
  const names = packages.map((p) => p.name).sort();

  if (!verdict.ok) {
    failures.push(
      `${expression} — not permissive and not reviewed: ${names.join(", ")}\n` +
        `      Add it to REVIEWED in scripts/check-licenses.mjs with a written reason, or remove ` +
        `the dependency.`,
    );
  } else if (verdict.reviewed?.verdict === "NEEDS OWNER CONSENT") {
    consent.push(`${expression} — ${names.join(", ")}`);
  }
}

if (write) {
  const lines = [
    "# Third-party licenses",
    "",
    "> **Generated — do not edit by hand.** `pnpm license:sbom` regenerates this from",
    "> `pnpm licenses list --json --prod`, i.e. pnpm's own resolution of the committed lockfile.",
    "> `pnpm license:check` fails CI when a dependency arrives under a licence nobody has reviewed.",
    "",
    "This is the record of third-party components required by **PROJECT-CONTEXT.md / NDA §5b**,",
    "which also binds the project to permissive licences only — no GPL, LGPL or AGPL without the",
    "Owner's prior written consent.",
    "",
    `**${packageCount} production packages across ${Object.keys(byLicense).length} licences.**`,
    "",
  ];

  if (consent.length > 0) {
    lines.push(
      "## ⚠ Requires the Owner's written consent",
      "",
      "Present in the tree today and **not approved** — recorded so the decision is visible:",
      "",
    );
    for (const c of consent) lines.push(`- ${c}`);
    lines.push("");
  }

  lines.push("## By licence", "");
  for (const expression of Object.keys(byLicense).sort()) {
    const verdict = classify(expression);
    const packages = byLicense[expression];
    const marker = verdict.reviewed
      ? verdict.reviewed.verdict === "NEEDS OWNER CONSENT"
        ? " ⚠"
        : " *(reviewed)*"
      : "";
    lines.push(`### ${expression}${marker} — ${packages.length}`, "");
    if (verdict.reviewed) lines.push(`> ${verdict.reviewed.reason}`, "");
    lines.push(
      packages
        .map((p) => `\`${p.name}\``)
        .sort()
        .join(" · "),
      "",
    );
  }
  writeFileSync("docs/THIRD-PARTY-LICENSES.md", `${lines.join("\n")}\n`);
  console.log(`SBOM written: docs/THIRD-PARTY-LICENSES.md (${packageCount} packages)`);
}

if (failures.length > 0) {
  console.error("\nlicense check FAILED\n");
  for (const f of failures) console.error(`  ${f}`);
  console.error("");
  process.exit(1);
}

console.log(
  `license check: OK — ${packageCount} production packages, ` +
    `${Object.keys(byLicense).length} licences, all permissive or reviewed.`,
);
if (consent.length > 0) {
  console.log(`\n  ⚠ ${consent.length} awaiting the Owner's written consent (NDA §5b):`);
  for (const c of consent) console.log(`      ${c}`);
  console.log(`  Recorded in docs/THIRD-PARTY-LICENSES.md. Not a build failure — a decision.`);
}
