import { describe, it, expect } from "vitest";
import { bulkLeadActionSchema } from "./lead";

describe("bulkLeadActionSchema", () => {
  describe("status action", () => {
    it("accepts a real non-terminal status", () => {
      const parsed = bulkLeadActionSchema.parse({
        action: "status",
        ids: ["l1"],
        value: "Outreach 1",
      });
      expect(parsed).toMatchObject({ action: "status", value: "Outreach 1" });
    });

    it('rejects "Promoted" (F1: promotion must go through leadService.promote(), not a bulk status set)', () => {
      expect(() =>
        bulkLeadActionSchema.parse({ action: "status", ids: ["l1"], value: "Promoted" }),
      ).toThrow();
    });

    it("rejects an unknown status string", () => {
      expect(() =>
        bulkLeadActionSchema.parse({ action: "status", ids: ["l1"], value: "Made Up Status" }),
      ).toThrow();
    });
  });

  it("rejects more than 200 ids", () => {
    const ids = Array.from({ length: 201 }, (_, i) => `l${i}`);
    expect(() => bulkLeadActionSchema.parse({ action: "delete", ids })).toThrow();
  });
});
