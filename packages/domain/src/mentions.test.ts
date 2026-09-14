import { describe, expect, it } from "vitest";
import { mentionToken, parseMentionTokens, resolveMentions, splitMentions } from "./mentions";

const USERS = [
  { id: "u1", name: "Biruh Desta" },
  { id: "u2", name: "Leliso Agegnehu" },
  { id: "u3", name: "Mike Smith" },
  { id: "u4", name: "Mike Jones" },
];

describe("parseMentionTokens", () => {
  it("extracts unique lowercased tokens under the legacy grammar (@ + letter + word/-)", () => {
    expect(parseMentionTokens("ping @Biruh and @Leliso re @Biruh")).toEqual(["biruh", "leliso"]);
  });

  it("ignores bare @, @digit, and emails' domain-less matches only after a letter", () => {
    expect(parseMentionTokens("mail me @ noon, v@2 spec")).toEqual([]);
    // An email body matches its domain-ish token after the @ — same as legacy; resolution
    // won't match a real user so nothing fires.
    expect(parseMentionTokens("jane@example.com")).toEqual(["example"]);
  });
});

describe("mentionToken", () => {
  it("uses the first name when unique", () => {
    expect(mentionToken(USERS[0]!, USERS)).toBe("Biruh");
  });

  it("uses the hyphenated full name on a first-name collision", () => {
    expect(mentionToken(USERS[2]!, USERS)).toBe("Mike-Smith");
    expect(mentionToken(USERS[3]!, USERS)).toBe("Mike-Jones");
  });
});

describe("resolveMentions", () => {
  it("matches first name and hyphenated full name, deduped, in first-mention order", () => {
    const out = resolveMentions("@Leliso then @Mike-Smith then @Leliso again", USERS);
    expect(out.map((u) => u.id)).toEqual(["u2", "u3"]);
  });

  it("resolves an AMBIGUOUS first name to nobody (never notifies every Mike)", () => {
    expect(resolveMentions("hey @Mike", USERS)).toEqual([]);
  });

  it("resolves unknown tokens to nobody", () => {
    expect(resolveMentions("cc @nobody-here", USERS)).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(resolveMentions("@biruh @LELISO", USERS).map((u) => u.id)).toEqual(["u1", "u2"]);
  });
});

describe("splitMentions", () => {
  it("splits a body into literal and mention runs (lossless)", () => {
    const body = "ping @Biruh — see @Mike-Smith.";
    const segs = splitMentions(body);
    expect(segs).toEqual([
      { text: "ping ", mention: false },
      { text: "@Biruh", mention: true },
      { text: " — see ", mention: false },
      { text: "@Mike-Smith", mention: true },
      { text: ".", mention: false },
    ]);
    expect(segs.map((s) => s.text).join("")).toBe(body);
  });

  it("returns one literal run when there are no mentions", () => {
    expect(splitMentions("plain text")).toEqual([{ text: "plain text", mention: false }]);
  });
});
