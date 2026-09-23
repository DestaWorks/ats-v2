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
      const last = test.results?.[test.results.length - 1];
      results.push({
        file: source,
        title: spec.title,
        status: last?.status ?? "unknown",
        expected: test.expectedStatus ?? "passed",
        durationMs: last?.duration ?? 0,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, source);
}
for (const suite of report.suites ?? []) walk(suite, suite.file);

const passed = results.filter((r) => r.status === r.expected);
const failed = results.filter((r) => r.status !== r.expected);
const totalMs = results.reduce((sum, r) => sum + r.durationMs, 0);

const byFile = new Map();
for (const r of results) {
  const area = (r.file ?? "unknown").replace(/^e2e\//, "").replace(/\.spec\.ts$/, "");
  const entry = byFile.get(area) ?? { total: 0, failed: 0 };
  entry.total += 1;
  if (r.status !== r.expected) entry.failed += 1;
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
  `| Total | **${results.length}** |`,
  "",
];

if (failed.length > 0) {
  lines.push("## Failures", "");
  for (const f of failed) {
    lines.push(`- **${f.title}** — \`${f.file}\``);
  }
  lines.push("");
}

lines.push("## Coverage by area", "", "| Area | Tests | Failed |", "|---|---|---|");
for (const [area, entry] of [...byFile.entries()].sort()) {
  lines.push(`| ${area} | ${entry.total} | ${entry.failed === 0 ? "—" : entry.failed} |`);
}
lines.push("");

const summary = lines.join("\n");
writeFileSync(OUTPUT, summary);

console.log("");
console.log(`  ${passed.length} passed, ${failed.length} failed, ${minutes(totalMs)}`);
console.log(`  Summary written to ${OUTPUT}`);
console.log("");
