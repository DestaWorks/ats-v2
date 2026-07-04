import { describe, it, expect } from "vitest";
import { toLegacyStatusLabel } from "@/lib/constants";
import { LEGACY_COLUMNS, type LegacyRow } from "./sheet-parse";
import {
  dedupeByEmail,
  mapToVocab,
  parseLegacyBool,
  parseLegacyDate,
  parseLegacyInt,
  transformRow,
  type ImportRowPlan,
} from "./candidate-import.transform";

/**
 * Pure transform + dedupe (Wave 1.3 §10). No DB, no I/O — the golden mapping, the tolerant scalar
 * parsers, the résumé-doc plan, and the email keep-newest dedupe are all exercised here.
 */

/** A blank 32-column row, overridable per test. */
function row(overrides: Partial<LegacyRow> = {}): LegacyRow {
  const base = {} as LegacyRow;
  for (const col of LEGACY_COLUMNS) base[col] = "";
  return { ...base, ...overrides };
}

const NO_CLIENTS = new Map<string, string>();

describe("scalar parsers", () => {
  it("parseLegacyDate handles ISO, M/D/YYYY, and Mon YYYY; else null", () => {
    expect(parseLegacyDate("2027-05-01")?.getUTCFullYear()).toBe(2027);
    const mdy = parseLegacyDate("5/1/2027")!;
    expect([mdy.getUTCFullYear(), mdy.getUTCMonth(), mdy.getUTCDate()]).toEqual([2027, 4, 1]);
    const my = parseLegacyDate("May 2027")!;
    expect([my.getUTCFullYear(), my.getUTCMonth(), my.getUTCDate()]).toEqual([2027, 4, 1]);
    expect(parseLegacyDate("")).toBeNull();
    expect(parseLegacyDate("not a date")).toBeNull();
  });

  it("parseLegacyInt truncates and rejects non-numeric", () => {
    expect(parseLegacyInt("7")).toBe(7);
    expect(parseLegacyInt("7.9")).toBe(7);
    expect(parseLegacyInt("")).toBeNull();
    expect(parseLegacyInt("many")).toBeNull();
  });

  it("parseLegacyBool is tolerant (true/yes/1/✓)", () => {
    for (const t of ["true", "TRUE", "Yes", "1", "✓"]) expect(parseLegacyBool(t)).toBe(true);
    for (const f of ["", "false", "no", "0", "maybe"]) expect(parseLegacyBool(f)).toBe(false);
  });

  it("mapToVocab is case-insensitive; empty → null (no note), unmapped → null + flag", () => {
    expect(mapToVocab("pmhnp", ["PMHNP", "MD"])).toEqual({ value: "PMHNP", unmapped: false });
    expect(mapToVocab("", ["MD"])).toEqual({ value: null, unmapped: false });
    expect(mapToVocab("wizard", ["MD"])).toEqual({ value: null, unmapped: true });
  });
});

describe("transformRow — column mapping", () => {
  it("maps every column onto the target and mirrors stageOrder from status", () => {
    const clients = new Map([["docs medical group", "client-1"]]);
    const plan = transformRow(
      row({
        ID: "L-1",
        Name: "Jane Doe",
        Credential: "PMHNP",
        LicenseState: "tx",
        LicenseNumber: "LIC-999",
        LicenseStatus: "Active",
        LicenseExpiry: "May 2027",
        Client: "DOCs Medical Group",
        Source: "Indeed",
        Status: toLegacyStatusLabel("SUBMITTED_TO_CLIENT"),
        Email: "Jane@Example.com",
        Phone: "555-0100",
        City: "Austin",
        State: "TX",
        Population: "Adult",
        Setting: "Telehealth",
        YearsExp: "8",
        Employer: "Acme",
        Tags: "Priority; Bilingual",
        AddedBy: "u-added",
        OutreachAttempts: "2",
        Track: "Clinical",
      }),
      2,
      clients,
    );

    expect(plan.action).toBe("add");
    expect(plan.errors).toEqual([]);
    expect(plan.create).toMatchObject({
      name: "Jane Doe",
      email: "Jane@Example.com",
      credential: "PMHNP",
      licenseState: "TX",
      licenseNumber: "LIC-999",
      licenseStatus: "Active",
      clientId: "client-1",
      source: "Indeed",
      status: "SUBMITTED_TO_CLIENT",
      stageOrder: 4,
      population: "Adult",
      setting: "Telehealth",
      yearsExp: 8,
      outreachAttempts: 2,
      createdById: "u-added",
    });
    expect(plan.create.tags).toEqual(expect.arrayContaining(["Priority", "Bilingual"]));
    expect(plan.normalizedEmail).toBe("jane@example.com");
    // update never rewrites provenance
    expect("createdAt" in plan.update).toBe(false);
    expect("createdById" in plan.update).toBe(false);
  });

  it("TelehealthPref truthy → appends the `Telehealth Only` tag; falsy → no tag", () => {
    const on = transformRow(
      row({
        ID: "1",
        Name: "A",
        Status: toLegacyStatusLabel("NEW_CANDIDATE"),
        TelehealthPref: "TRUE",
      }),
      2,
      NO_CLIENTS,
    );
    expect(on.create.tags).toContain("Telehealth Only");
    const off = transformRow(
      row({ ID: "2", Name: "B", Status: toLegacyStatusLabel("NEW_CANDIDATE"), TelehealthPref: "" }),
      2,
      NO_CLIENTS,
    );
    expect(off.create.tags).not.toContain("Telehealth Only");
  });

  it("DeletedAt present → action softDelete + deletedAt/deletedById set (imports to Trash)", () => {
    const plan = transformRow(
      row({
        ID: "3",
        Name: "Gone",
        Status: toLegacyStatusLabel("NEW_CANDIDATE"),
        DeletedAt: "2024-01-15",
        DeletedBy: "u-del",
      }),
      2,
      NO_CLIENTS,
    );
    expect(plan.action).toBe("softDelete");
    expect(plan.softDeleted).toBe(true);
    expect(plan.create.deletedAt).toBeInstanceOf(Date);
    expect(plan.create.deletedById).toBe("u-del");
    expect(plan.update.deletedAt).toBeInstanceOf(Date);
  });

  it("re-run update omits new-app-owned fields (status/stageOrder/timing/tags), refreshes profile", () => {
    const plan = transformRow(
      row({
        ID: "9",
        Name: "Re Run",
        Status: toLegacyStatusLabel("QUALIFIED_PRESCREEN"),
        Track: "Clinical",
        Tags: "Priority",
        Email: "r@x.com",
      }),
      2,
      NO_CLIENTS,
    );
    // create carries the full legacy snapshot (first import)
    expect(plan.create.status).toBeDefined();
    expect(plan.create.tags).toBeDefined();
    // update (re-run) must NOT clobber pipeline state or tags a human may have changed in-app
    expect(plan.update.status).toBeUndefined();
    expect(plan.update.stageOrder).toBeUndefined();
    expect(plan.update.stageEnteredAt).toBeUndefined();
    expect(plan.update.placedAt).toBeUndefined();
    expect(plan.update.tags).toBeUndefined();
    // but profile fields DO refresh from the Sheet (pre-cutover delta re-sync)
    expect(plan.update.name).toBe("Re Run");
    expect(plan.update.email).toBe("r@x.com");
  });

  it("unrecognized Status → error (excluded from commit), never guessed", () => {
    const plan = transformRow(row({ ID: "4", Name: "X", Status: "99 - Bogus" }), 2, NO_CLIENTS);
    expect(plan.action).toBe("error");
    expect(plan.errors).toContain("unrecognized-status");
  });

  it("missing ID / missing Name → error", () => {
    const noId = transformRow(
      row({ Name: "X", Status: toLegacyStatusLabel("NEW_CANDIDATE") }),
      2,
      NO_CLIENTS,
    );
    expect(noId.errors).toContain("missing-id");
    const noName = transformRow(
      row({ ID: "5", Status: toLegacyStatusLabel("NEW_CANDIDATE") }),
      2,
      NO_CLIENTS,
    );
    expect(noName.errors).toContain("missing-name");
  });

  it("unmapped vocab → null + a note (non-blocking, not an error)", () => {
    const plan = transformRow(
      row({
        ID: "6",
        Name: "X",
        Status: toLegacyStatusLabel("NEW_CANDIDATE"),
        Credential: "Sorcerer",
        Population: "Martians",
      }),
      2,
      NO_CLIENTS,
    );
    expect(plan.action).toBe("add");
    expect(plan.create.credential).toBeNull();
    expect(plan.create.population).toBeNull();
    expect(plan.notes).toEqual(
      expect.arrayContaining(["unmapped-credential", "unmapped-population"]),
    );
  });

  it("unknown non-empty Client → clientId null + flag; empty → null unflagged", () => {
    const unknown = transformRow(
      row({
        ID: "7",
        Name: "X",
        Status: toLegacyStatusLabel("NEW_CANDIDATE"),
        Client: "Nowhere LLC",
      }),
      2,
      NO_CLIENTS,
    );
    expect(unknown.create.clientId).toBeNull();
    expect(unknown.flags).toContain("unknown-client");
    const none = transformRow(
      row({ ID: "8", Name: "X", Status: toLegacyStatusLabel("NEW_CANDIDATE"), Client: "" }),
      2,
      NO_CLIENTS,
    );
    expect(none.flags).toEqual([]);
  });

  it("résumé trio present → a DocumentUpsertPlan keyed by ResumeFileID with legacyUrl preserved; absent → none", () => {
    const withDoc = transformRow(
      row({
        ID: "9",
        Name: "X",
        Status: toLegacyStatusLabel("NEW_CANDIDATE"),
        ResumeFileID: "drive-abc",
        ResumeURL: "https://drive.example/abc",
        ResumeFilename: "jane.pdf",
      }),
      2,
      NO_CLIENTS,
    );
    expect(withDoc.document).toEqual({
      legacyId: "drive-abc",
      legacyUrl: "https://drive.example/abc",
      originalFilename: "jane.pdf",
      type: "resume",
      mimeType: "application/pdf",
    });
    const noDoc = transformRow(
      row({ ID: "10", Name: "X", Status: toLegacyStatusLabel("NEW_CANDIDATE") }),
      2,
      NO_CLIENTS,
    );
    expect(noDoc.document).toBeUndefined();
  });
});

describe("dedupeByEmail", () => {
  function plan(id: string, email: string, updatedAt: Date | null): ImportRowPlan {
    return transformRow(
      row({
        ID: id,
        Name: id,
        Status: toLegacyStatusLabel("NEW_CANDIDATE"),
        Email: email,
        UpdatedAt: updatedAt ? updatedAt.toISOString() : "",
      }),
      2,
      NO_CLIENTS,
    );
  }

  it("different legacy_id, same email → both kept, group reported, keep-newest primary, Needs Review tag", () => {
    const a = plan("A", "dup@x.com", new Date("2024-01-01"));
    const b = plan("B", "DUP@x.com", new Date("2024-06-01")); // newer, different case
    const groups = dedupeByEmail([a, b]);

    // nothing dropped — both still importable
    expect(a.action).not.toBe("skip");
    expect(b.action).not.toBe("skip");
    expect(a.flags).toContain("email-duplicate");
    expect(b.flags).toContain("email-duplicate");
    expect(a.create.tags).toContain("Needs Review");
    expect(b.create.tags).toContain("Needs Review");

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ email: "dup@x.com", keptLegacyId: "B" });
    expect(groups[0]!.legacyIds).toEqual(["A", "B"]);
  });

  it("same legacy_id twice → the second is skip (not a false email-dupe)", () => {
    const a = plan("SAME", "s@x.com", new Date("2024-01-01"));
    const b = plan("SAME", "s@x.com", new Date("2024-02-01"));
    const groups = dedupeByEmail([a, b]);
    expect(b.action).toBe("skip");
    expect(b.notes).toContain("duplicate-legacy-id");
    expect(groups).toHaveLength(0);
  });

  it("blank emails never group", () => {
    const a = plan("A", "", null);
    const b = plan("B", "", null);
    expect(dedupeByEmail([a, b])).toHaveLength(0);
  });

  it("collides against an already-migrated candidate (cross-run)", () => {
    const a = plan("NEW", "shared@x.com", new Date("2024-05-01"));
    const groups = dedupeByEmail(
      [a],
      [
        {
          legacyId: "OLD",
          email: "shared@x.com",
          updatedAt: new Date("2024-09-01"),
          createdAt: null,
        },
      ],
    );
    expect(a.flags).toContain("email-duplicate");
    expect(groups[0]).toMatchObject({ keptLegacyId: "OLD" });
    expect(groups[0]!.legacyIds).toEqual(["NEW", "OLD"]);
  });
});
