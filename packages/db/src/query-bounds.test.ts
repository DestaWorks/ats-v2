import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/**
 * Every `findMany` in the data layer is bounded, or is named here as a read that must stay
 * COMPLETE.
 *
 * A `findMany` with no `take` returns whatever one tenant has accumulated. That is invisible in
 * review, invisible in tests, and on a shared install it is every other tenant's page latency too —
 * so the property is enforced structurally rather than left to the next reader to notice. The
 * allowlist is the interesting half: each entry is a query whose caller reasons over the whole
 * result (a dedupe set, a scoring pool, an aggregate) and would be silently WRONG if truncated, or
 * one already bounded by the id set it was handed.
 */

const SRC = dirname(fileURLToPath(import.meta.url));
const DIRS = ["repositories", "tenancy"];

/**
 * `file::method` for each read that is deliberately unbounded, with the reason it may not be
 * capped. Adding a line here is a decision about correctness, not a formality.
 */
const COMPLETE_READS: Record<string, string> = {
  // Bounded by the id / email / name / NPI set the caller passed in.
  "candidate.repository.ts::namesByIds": "bounded by the id set",
  "candidate.repository.ts::findManyByEmails": "bounded by the email set",
  "candidate.repository.ts::findManyByNames": "bounded by the name set",
  "lead.repository.ts::findManyByIds": "bounded by the id set",
  "lead.repository.ts::findManyByEmails": "bounded by the email set",
  "lead.repository.ts::findManyByNames": "bounded by the name set",
  "lead.repository.ts::findManyByNpis": "bounded by the NPI set",
  "prospect.repository.ts::findManyByIds": "bounded by the id set",
  "prospect.repository.ts::findManyByNpis": "bounded by the NPI set",
  "open-role.repository.ts::findManyByIds": "bounded by the id set",
  "client-portal-token.repository.ts::findActiveForContacts":
    "bounded by the contact set — at most one live token each",
  "stage-history.repository.ts::listByCandidateIds": "bounded by the candidate set",
  "user.repository.ts::namesByIds": "bounded by the id set",
  "user.repository.ts::emailsByIds": "bounded by the id set",

  // Batched per-parent reads: a cap would drop one client's rows out of a comparison and skew the
  // health figures computed from them, with nothing in the result to say so.
  "client-note.repository.ts::listForClients": "every note counts toward the compared health score",
  "client-meeting.repository.ts::listForClients":
    "every meeting counts toward the compared health score",
  "client-task.repository.ts::listForClients": "every task counts toward the compared health score",
  "deal.repository.ts::listForClients": "every deal counts toward the compared health score",
  "deal-blocker.repository.ts::listForDeals": "bounded by the deal set",

  // Whole-cohort reads whose caller's answer is wrong, not merely short, if a row is missing.
  "candidate.repository.ts::listForMatch":
    "the resume matcher's candidate pool — a truncated pool silently matches a resume to the wrong candidate, or to none",
  "candidate.repository.ts::listForDedupe":
    "the ETL's dedupe key set — a truncated set re-imports existing candidates as duplicates",
  "lead.repository.ts::listForMatching":
    "the role matcher's whole active lead pool — a truncated pool changes the ranking it returns",
  "credentials-intelligence.repository.ts::gapAnalysisCandidates":
    "counted per client/credential cell — a truncated read reports a coverage gap that does not exist",
  "stage-history.repository.ts::enteredStatusCountsByRange":
    "a count over a bounded date window; truncating it undercounts hires",
  "template-performance.repository.ts::attemptsWithTemplate":
    "per-template response rates over every logged send — a truncated read skews the rate",
};

interface Read {
  key: string;
  where: string;
  bounded: boolean;
}

/** The name of the repository method a node sits inside, or `"<top level>"`. */
function enclosingMethod(node: ts.Node): string {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.parent &&
      ts.isPropertyAssignment(n.parent) &&
      ts.isIdentifier(n.parent.name)
    ) {
      return n.parent.name.text;
    }
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
  }
  return "<top level>";
}

function readsIn(dir: string): Read[] {
  const found: Read[] = [];
  for (const file of readdirSync(join(SRC, dir)).sort()) {
    if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
    const path = join(SRC, dir, file);
    const sf = ts.createSourceFile(
      path,
      readFileSync(path, "utf8"),
      ts.ScriptTarget.ESNext,
      true,
      ts.ScriptKind.TS,
    );
    const walk = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "findMany"
      ) {
        const [arg] = node.arguments;
        const bounded =
          arg !== undefined &&
          ts.isObjectLiteralExpression(arg) &&
          arg.properties.some(
            (p) => p.name !== undefined && ts.isIdentifier(p.name) && p.name.text === "take",
          );
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        found.push({
          key: `${file}::${enclosingMethod(node)}`,
          where: `${relative(SRC, path)}:${line + 1}`,
          bounded,
        });
      }
      node.forEachChild(walk);
    };
    walk(sf);
  }
  return found;
}

const reads = DIRS.flatMap(readsIn);

describe("query bounds across the data layer", () => {
  it("finds the repository layer at all (the parser, not the layer, is what breaks silently)", () => {
    expect(reads.length).toBeGreaterThan(60);
  });

  it("bounds every findMany that is not a declared complete read", () => {
    const unbounded = reads
      .filter((r) => !r.bounded && COMPLETE_READS[r.key] === undefined)
      .map((r) => `${r.where} (${r.key})`);
    expect(unbounded).toEqual([]);
  });

  it("keeps no stale entry in the complete-read allowlist", () => {
    const live = new Set(reads.filter((r) => !r.bounded).map((r) => r.key));
    expect(Object.keys(COMPLETE_READS).filter((key) => !live.has(key))).toEqual([]);
  });
});
