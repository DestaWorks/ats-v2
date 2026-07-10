import { describe, expect, it } from "vitest";
import { formatRelativeTime, noteTypeLabel, noteTypeTone } from "./notes-format";

describe("noteTypeTone / noteTypeLabel", () => {
  it("maps the 5 legacy note types to tones and labels", () => {
    expect(noteTypeTone("internal")).toBe("neutral");
    expect(noteTypeTone("client")).toBe("amber");
    expect(noteTypeTone("call")).toBe("success");
    expect(noteTypeTone("email")).toBe("navy");
    expect(noteTypeTone("text")).toBe("navy");
    expect(noteTypeLabel("internal")).toBe("Note");
    expect(noteTypeLabel("client")).toBe("Client note");
    expect(noteTypeLabel("call")).toBe("Call log");
    expect(noteTypeLabel("email")).toBe("Email log");
    expect(noteTypeLabel("text")).toBe("Text log");
  });
});

describe("formatRelativeTime", () => {
  const now = new Date("2026-07-04T12:00:00.000Z").getTime();

  it("buckets recent timestamps", () => {
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
    expect(formatRelativeTime(iso(10_000), now)).toBe("just now");
    expect(formatRelativeTime(iso(5 * 60_000), now)).toBe("5m ago");
    expect(formatRelativeTime(iso(3 * 3_600_000), now)).toBe("3h ago");
    expect(formatRelativeTime(iso(2 * 86_400_000), now)).toBe("2d ago");
  });

  it("falls back to a locale date past a week", () => {
    const old = new Date("2026-01-01T00:00:00.000Z").toISOString();
    const out = formatRelativeTime(old, now);
    expect(out).not.toMatch(/ago|just now/);
    expect(out.length).toBeGreaterThan(0);
  });

  it("clamps future timestamps to 'just now' and handles invalid input", () => {
    expect(formatRelativeTime(new Date(now + 60_000).toISOString(), now)).toBe("just now");
    expect(formatRelativeTime("not-a-date", now)).toBe("");
  });
});
