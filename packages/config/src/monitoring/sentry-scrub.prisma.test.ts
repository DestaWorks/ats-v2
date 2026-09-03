import { describe, it, expect } from "vitest";
import { scrubEvent, type ErrorEvent } from "./sentry-scrub";

describe("scrubEvent — Prisma messages", () => {
  it("redacts a Prisma error message, which embeds field values", () => {
    const event = {
      exception: {
        values: [
          {
            type: "PrismaClientKnownRequestError",
            value: "Unique constraint failed on the fields: (`email`) — a.bekele@example.com",
            stacktrace: { frames: [{ function: "createCandidate" }] },
          },
        ],
      },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    const ex = out.exception!.values![0]!;
    expect(ex.value).not.toContain("a.bekele@example.com");
    expect(ex.type).toBe("PrismaClientKnownRequestError");
    expect(ex.stacktrace).toBeDefined();
  });

  it("leaves a normal application error message intact", () => {
    const event = {
      exception: { values: [{ type: "AppError", value: "Candidate not found." }] },
    } as unknown as ErrorEvent;
    expect(scrubEvent(event).exception!.values![0]!.value).toBe("Candidate not found.");
  });
});
