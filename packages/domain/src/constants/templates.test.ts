import { describe, it, expect } from "vitest";
import {
  TEMPLATE_CATEGORIES,
  TEMPLATES,
  templatesByCategory,
  findTemplate,
  CLIENT_TEMPLATE_INFO,
  clientTemplateInfo,
  CLIENT_TEMPLATE_INFO_FALLBACK,
  SIGNATURE_PRESETS,
  defaultSignature,
} from "./templates";
import { BASE_CLIENTS } from "./clients";

describe("TEMPLATES", () => {
  it("has 12 templates, each with non-empty subject/body and a known category/dir", () => {
    expect(TEMPLATES).toHaveLength(12);
    const categoryIds = TEMPLATE_CATEGORIES.map((c) => c.id);
    for (const t of TEMPLATES) {
      expect(t.subject.length).toBeGreaterThan(0);
      expect(t.body.length).toBeGreaterThan(0);
      expect(categoryIds).toContain(t.category);
      expect(["to-candidate", "to-client"]).toContain(t.dir);
    }
  });

  it("has unique template ids", () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every category has at least one template", () => {
    for (const cat of TEMPLATE_CATEGORIES) {
      expect(templatesByCategory(cat.id).length).toBeGreaterThan(0);
    }
  });

  it("findTemplate resolves a known id and returns undefined for an unknown one", () => {
    expect(findTemplate("initial")?.name).toBe("Initial Outreach");
    expect(findTemplate("nope")).toBeUndefined();
  });
});

describe("CLIENT_TEMPLATE_INFO", () => {
  it("covers every real base client name (matches clients.ts exactly, no drift)", () => {
    for (const name of Object.keys(CLIENT_TEMPLATE_INFO)) {
      expect(BASE_CLIENTS.some((c) => c.name === name)).toBe(true);
    }
  });

  it("falls back to generic copy for a client with no entry", () => {
    expect(clientTemplateInfo("Some New Client")).toEqual(CLIENT_TEMPLATE_INFO_FALLBACK);
  });

  it("returns the specific entry for a known client", () => {
    expect(clientTemplateInfo("Sterling Institute").contactTitle).toBe("Hiring Manager");
  });
});

describe("signature presets", () => {
  it("every preset renders the recruiter name into its body", () => {
    for (const preset of SIGNATURE_PRESETS) {
      expect(preset.body("Jane Doe")).toContain("Jane Doe");
    }
  });

  it("defaultSignature includes the recruiter name", () => {
    expect(defaultSignature("Jane Doe")).toContain("Jane Doe");
  });
});
