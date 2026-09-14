import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Redaction strips PII at serialization time, but nothing stops a PII key being written into a
 * log call in the first place — and a key the redactor does not know about is not redacted.
 * This asserts the source never names one (CONVENTIONS §7, HIPAA + Proclamation 1321/2024).
 */

/** An object KEY only — `(?<![.\w])` rejects `err.name :` in a ternary, where the colon is not a
 *  property separator. Matched against the fields object of each logger call, not whole files. */
const PII_KEYS =
  /(?<![.\w])(email|phone|mobile|name|firstName|lastName|fullName|licenseNumber|license|npi|dea|ssn|dateOfBirth|dob|address)\s*:/;

/** Every tree that holds first-party source. Phase 2 moves code out of `src/` package by package,
 *  so scanning `src/` alone would shrink to nothing while still passing. */
const SCAN_ROOTS = ["src", "apps", "packages"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "generated" || entry === "node_modules") continue;
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** The `{ ... }` fields argument of each `logger.<level>(` call in a file. */
function loggerFieldBlocks(src: string): string[] {
  const blocks: string[] = [];
  const call = /logger\.(?:debug|info|warn|error)\(/g;
  let m: RegExpExecArray | null;
  while ((m = call.exec(src)) !== null) {
    let depth = 0;
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          blocks.push(src.slice(m.index, i + 1));
          break;
        }
      }
    }
  }
  return blocks;
}

describe("no PII/PHI key is named in a log call", () => {
  it("scans every logger call site in src/, apps/ and packages/", () => {
    const offenders: string[] = [];
    const files = SCAN_ROOTS.filter((root) => existsSync(root)).flatMap((root) =>
      sourceFiles(root),
    );
    expect(files.length).toBeGreaterThan(200);
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (!src.includes("logger.")) continue;
      for (const block of loggerFieldBlocks(src)) {
        if (PII_KEYS.test(block)) {
          offenders.push(`${file}: ${block.replace(/\s+/g, " ").slice(0, 120)}`);
        }
      }
    }
    expect(offenders, `PII/PHI key named in a log call:\n${offenders.join("\n")}`).toEqual([]);
  });
});
