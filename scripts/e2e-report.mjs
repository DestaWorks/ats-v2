#!/usr/bin/env node
// Turns Playwright's JSON result into a summary a non-engineer can read.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const INPUT = "playwright-report/results.json";
const OUTPUT = "playwright-report/SUMMARY.md";

if (!existsSync(INPUT)) {
  console.error(`No results at ${INPUT}. Run the suite first.`);
  process.exit(1);
}

const report = JSON.parse(readFileSync(INPUT, "utf8"));

const results = [];
function walk(suite, file) {
  const source = suite.file ?? file;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      const attempts = test.results ?? [];
      const last = attempts[attempts.length - 1];
      results.push({
        file: source,
        title: spec.title,
        // Playwright's own verdict: a test that failed then passed on retry is "flaky", which the
        // last attempt's status cannot tell you — it just says "passed".
        verdict: test.status ?? "unknown",
        attempts: attempts.length,
        durationMs: attempts.reduce((sum, a) => sum + (a.duration ?? 0), 0),
        firstFailureMs: attempts.length > 1 ? (attempts[0]?.duration ?? 0) : 0,
        lastStatus: last?.status ?? "unknown",
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, source);
}
for (const suite of report.suites ?? []) walk(suite, suite.file);

const passed = results.filter((r) => r.verdict === "expected");
const flaky = results.filter((r) => r.verdict === "flaky");
const skipped = results.filter((r) => r.verdict === "skipped");
const failed = results.filter((r) => !["expected", "flaky", "skipped"].includes(r.verdict));
const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

const byFile = new Map();
for (const r of results) {
  const area = (r.file ?? "unknown").replace(/^e2e\//, "").replace(/\.spec\.ts$/, "");
  const entry = byFile.get(area) ?? { total: 0, failed: 0, flaky: 0 };
  entry.total += 1;
  if (r.verdict === "flaky") entry.flaky += 1;
  else if (!["expected", "skipped"].includes(r.verdict)) entry.failed += 1;
  byFile.set(area, entry);
}

const minutes = (ms) => `${(ms / 60000).toFixed(1)} min`;
const stamp = report.stats?.startTime ?? new Date().toISOString();

const lines = [
  "# End-to-end test report",
  "",
  `**Run:** ${stamp.replace("T", " ").slice(0, 16)} · **Duration:** ${minutes(totalMs)}`,
  "",
  `| Result | Count |`,
  `|---|---|`,
  `| Passed | **${passed.length}** |`,
  `| Failed | **${failed.length}** |`,
  `| Passed only after a retry | **${flaky.length}** |`,
  ...(skipped.length > 0 ? [`| Skipped | **${skipped.length}** |`] : []),
  `| Total | **${results.length}** |`,
  "",
];

if (flaky.length > 0) {
  lines.push(
    "## Passed only after a retry",
    "",
    "These failed on their first attempt and passed when retried. The run is green, but a test",
    "that needs a retry is not yet trustworthy — each one is a real defect in the test or the",
    "thing it exercises.",
    "",
  );
  for (const f of flaky) {
    const wasted = `${(f.firstFailureMs / 1000).toFixed(0)}s`;
    lines.push(`- **${f.title}** — \`${f.file}\` (first attempt failed after ${wasted})`);
  }
  lines.push("");
}

if (failed.length > 0) {
  lines.push("## Failures", "");
  for (const f of failed) {
    lines.push(`- **${f.title}** — \`${f.file}\``);
  }
  lines.push("");
}

lines.push("## Coverage by area", "", "| Area | Tests | Failed | Flaky |", "|---|---|---|---|");
for (const [area, entry] of [...byFile.entries()].sort()) {
  lines.push(
    `| ${area} | ${entry.total} | ${entry.failed === 0 ? "—" : entry.failed} | ${entry.flaky === 0 ? "—" : entry.flaky} |`,
  );
}
lines.push("");

const summary = lines.join("\n");
writeFileSync(OUTPUT, summary);

console.log("");
console.log(
  `  ${passed.length} passed, ${failed.length} failed, ${flaky.length} flaky, ${minutes(totalMs)}`,
);
for (const f of flaky) console.log(`  FLAKY: ${f.title} (${f.file})`);
console.log(`  Summary written to ${OUTPUT}`);
console.log("");
