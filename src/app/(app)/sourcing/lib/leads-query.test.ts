import { describe, it, expect } from "vitest";
import { leadActionState } from "./leads-query";

describe("leadActionState", () => {
  it("enables every action for an active lead", () => {
    expect(leadActionState("Sourced")).toEqual({
      canLogOutreach: true,
      canRespond: true,
      canPromote: true,
    });
    expect(leadActionState("Responded — Hot")).toEqual({
      canLogOutreach: true,
      canRespond: true,
      canPromote: true,
    });
  });

  it("disables every action once the lead is Promoted (terminal)", () => {
    expect(leadActionState("Promoted")).toEqual({
      canLogOutreach: false,
      canRespond: false,
      canPromote: false,
    });
  });
});
