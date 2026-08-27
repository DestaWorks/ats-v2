import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Guards the DTO published surface: the schema is NOT the API. Every scalar column of a Prisma
 * model that a DTO is built from must be consciously classified as published, capability-gated,
 * or withheld, and the mapper must emit exactly the classified keys — no more. Reads
 * `prisma/schema.prisma` directly (not the DTO's own types) so the check cannot be satisfied by
 * restating the type: adding a column to the model fails this suite until someone decides where
 * it belongs, and reverting a mapper to `{ ...row }` fails it too.
 */

// `server-only` throws outside an RSC build; neutralize it for the unit test.
vi.mock("server-only", () => ({}));

import {
  CANDIDATE_GATED_FIELDS,
  CANDIDATE_PUBLISHED_FIELDS,
  CANDIDATE_WITHHELD_FIELDS,
  toCandidateDTO,
} from "./candidate.dto";
import {
  DOCUMENT_GATED_FIELDS,
  DOCUMENT_PUBLISHED_FIELDS,
  DOCUMENT_WITHHELD_FIELDS,
  toDocumentDTO,
} from "./document.dto";
import type { CandidateRow } from "@destaworks/db/repositories/candidate.repository";
import type { DocumentRow } from "@destaworks/db/repositories/document.repository";

const SCHEMA = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");

/** Every declared model/enum/type/view name — how a relation field is told from a scalar column. */
const DECLARED_TYPES = new Set(
  [...SCHEMA.matchAll(/^(?:model|enum|type|view)\s+(\w+)\s*\{/gm)].map((m) => String(m[1])),
);

/** The scalar columns of a model, straight out of the schema file (relations excluded). */
function scalarColumns(model: string): string[] {
  const block = new RegExp(String.raw`^model\s+${model}\s*\{([\s\S]*?)^\}`, "m").exec(SCHEMA);
  if (!block) throw new Error(`model ${model} not found in prisma/schema.prisma`);
  const columns: string[] = [];
  for (const rawLine of String(block[1]).split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
    const field = /^(\w+)\s+(\w+)/.exec(line);
    if (!field) continue;
    const name = String(field[1]);
    const type = String(field[2]);
    if (DECLARED_TYPES.has(type)) continue; // relation field — never serialized by a DTO
    columns.push(name);
  }
  return columns;
}

/** A stand-in row carrying EVERY column the schema declares, plus any injected extras. */
function rowFromSchema(model: string, extras: string[] = []): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const column of [...scalarColumns(model), ...extras]) row[column] = `value:${column}`;
  return row;
}

function unclassified(model: string, ...lists: readonly (readonly string[])[]): string[] {
  const classified = new Set(lists.flat());
  return scalarColumns(model).filter((column) => !classified.has(column));
}

function phantom(model: string, ...lists: readonly (readonly string[])[]): string[] {
  const columns = new Set(scalarColumns(model));
  return lists.flat().filter((field) => !columns.has(field));
}

const sorted = (values: readonly string[]) => [...values].sort();

describe("Candidate published surface", () => {
  it("classifies every column in the schema as published, gated, or withheld", () => {
    expect(
      unclassified(
        "Candidate",
        CANDIDATE_PUBLISHED_FIELDS,
        CANDIDATE_GATED_FIELDS,
        CANDIDATE_WITHHELD_FIELDS,
      ),
    ).toEqual([]);
  });

  it("classifies no field the model does not have", () => {
    expect(
      phantom(
        "Candidate",
        CANDIDATE_PUBLISHED_FIELDS,
        CANDIDATE_GATED_FIELDS,
        CANDIDATE_WITHHELD_FIELDS,
      ),
    ).toEqual([]);
  });

  it("emits exactly the published + gated fields for a viewCredentials holder", () => {
    const dto = toCandidateDTO(rowFromSchema("Candidate") as unknown as CandidateRow, {
      role: "Owner",
    });
    expect(sorted(Object.keys(dto))).toEqual(
      sorted([...CANDIDATE_PUBLISHED_FIELDS, ...CANDIDATE_GATED_FIELDS]),
    );
  });

  it("emits exactly the published fields for a viewer without the capability", () => {
    const dto = toCandidateDTO(rowFromSchema("Candidate") as unknown as CandidateRow, {
      role: "Associate",
    });
    expect(sorted(Object.keys(dto))).toEqual(sorted(CANDIDATE_PUBLISHED_FIELDS));
    // Absent, not null — an unauthorized viewer must not be able to infer the field exists.
    expect(Object.hasOwn(dto, "licenseNumber")).toBe(false);
  });

  it("drops a column the whitelist does not name, for every role", () => {
    const row = rowFromSchema("Candidate", ["ssn", "diagnosisNotes"]);
    for (const role of ["Owner", "Associate"] as const) {
      const dto = toCandidateDTO(row as unknown as CandidateRow, { role });
      expect(Object.keys(dto)).not.toContain("ssn");
      expect(Object.keys(dto)).not.toContain("diagnosisNotes");
    }
  });
});

describe("Document published surface", () => {
  it("classifies every column in the schema as published, gated, or withheld", () => {
    expect(
      unclassified(
        "Document",
        DOCUMENT_PUBLISHED_FIELDS,
        DOCUMENT_GATED_FIELDS,
        DOCUMENT_WITHHELD_FIELDS,
      ),
    ).toEqual([]);
  });

  it("classifies no field the model does not have", () => {
    expect(
      phantom(
        "Document",
        DOCUMENT_PUBLISHED_FIELDS,
        DOCUMENT_GATED_FIELDS,
        DOCUMENT_WITHHELD_FIELDS,
      ),
    ).toEqual([]);
  });

  it("emits exactly the published + gated fields for a viewCredentials holder", () => {
    const dto = toDocumentDTO(rowFromSchema("Document") as unknown as DocumentRow, {
      role: "Owner",
    });
    expect(sorted(Object.keys(dto))).toEqual(
      sorted([...DOCUMENT_PUBLISHED_FIELDS, ...DOCUMENT_GATED_FIELDS]),
    );
    expect(dto.extractedText).toBe("value:extractedText");
  });

  it("emits exactly the published fields for a viewer without the capability", () => {
    const dto = toDocumentDTO(rowFromSchema("Document") as unknown as DocumentRow, {
      role: "Associate",
    });
    expect(sorted(Object.keys(dto))).toEqual(sorted(DOCUMENT_PUBLISHED_FIELDS));
    expect(Object.hasOwn(dto, "extractedText")).toBe(false);
    expect(Object.hasOwn(dto, "extractedData")).toBe(false);
  });

  it("drops a column the whitelist does not name, for every role", () => {
    const row = rowFromSchema("Document", ["ocrRawPayload"]);
    for (const role of ["Owner", "Associate"] as const) {
      const dto = toDocumentDTO(row as unknown as DocumentRow, { role });
      expect(Object.keys(dto)).not.toContain("ocrRawPayload");
    }
  });
});
