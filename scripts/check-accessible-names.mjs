#!/usr/bin/env node
// Every form control must expose an accessible name: a label via `id`, an `aria-label(ledby)`,
// or a wrapping `<label>`. Placeholders do not count — they vanish on input.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "apps/web/src/app";
const CONTROLS = /<(Input|Textarea|Select|input|textarea|select)\b/g;
const NAMED = ["aria-label", "aria-labelledby", "id="];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(path));
    else if (entry.name.endsWith(".tsx")) out.push(path);
  }
  return out;
}

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => "\n".repeat((m.match(/\n/g) ?? []).length))
    .replace(/(?<!:)\/\/[^\n]*/g, "");

/** Scan to the tag's own `>`, ignoring any inside `{...}` — template literals nest braces. */
function tagText(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (c === "{" || c === "(") depth += 1;
    else if (c === "}" || c === ")") depth -= 1;
    else if (c === ">" && depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start, start + 400);
}

function insideLabel(src, pos) {
  const before = src.slice(0, pos);
  const open = before.lastIndexOf("<label");
  return open !== -1 && !src.slice(open, pos).includes("</label>");
}

const findings = [];
for (const file of walk(ROOT)) {
  const src = stripComments(readFileSync(file, "utf8"));
  for (const match of src.matchAll(CONTROLS)) {
    const tag = tagText(src, match.index);
    if (NAMED.some((attr) => tag.includes(attr))) continue;
    if (tag.includes('type="hidden"') || insideLabel(src, match.index)) continue;
    findings.push(`${file}:${src.slice(0, match.index).split("\n").length}  <${match[1]}>`);
  }
}

if (findings.length > 0) {
  console.error(`accessible names: FAIL — ${findings.length} control(s) with no accessible name\n`);
  for (const f of findings) console.error(`  ${f}`);
  console.error("\nAdd a label with `id`/`htmlFor`, an `aria-label`, or wrap it in a <label>.");
  process.exit(1);
}
console.log("accessible names: OK — every form control exposes one.");
