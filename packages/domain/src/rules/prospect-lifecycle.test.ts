import { describe, it, expect } from "vitest";
import { PROSPECT_STATUSES } from "../constants";
import { canEditProspect, canManageContacts } from "./prospect-lifecycle";

describe("canEditProspect", () => {
  it("is legal for every status except Client (terminal — converted)", () => {
    for (const status of PROSPECT_STATUSES) {
      expect(canEditProspect(status)).toBe(status !== "Client");
    }
  });
});

describe("canManageContacts", () => {
  it("is legal for every status except Client (terminal — converted)", () => {
    for (const status of PROSPECT_STATUSES) {
      expect(canManageContacts(status)).toBe(status !== "Client");
    }
  });
});
