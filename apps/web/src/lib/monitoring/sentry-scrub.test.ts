import { describe, it, expect } from "vitest";
import { scrubEvent, scrubBreadcrumb } from "./sentry-scrub";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

describe("scrubEvent", () => {
  it("strips the request body, query string, and cookies entirely", () => {
    const event = {
      request: {
        url: "https://desta-ats.vercel.app/api/candidates/c1",
        method: "PATCH",
        data: { email: "jane@example.com", name: "Jane Doe" },
        query_string: "token=secret123",
        cookies: { session: "abc" },
        headers: { "user-agent": "Mozilla/5.0", authorization: "Bearer xyz" },
      },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.request?.data).toBeUndefined();
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    expect(out.request?.headers).toEqual({ "user-agent": "Mozilla/5.0" });
    expect(out.request?.url).toBe("https://desta-ats.vercel.app/api/candidates/c1");
    expect(out.request?.method).toBe("PATCH");
  });

  it("reduces user to an opaque id — never email or name", () => {
    const event = {
      user: { id: "u1", email: "jane@example.com", username: "Jane Doe" },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.user).toEqual({ id: "u1" });
  });

  it("drops the user entirely when it has no id", () => {
    const event = { user: { email: "jane@example.com" } } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.user).toBeUndefined();
  });

  it("deep-redacts sensitive keys in extra/contexts/tags, keeps everything else", () => {
    const event = {
      extra: {
        candidateName: "Jane Doe",
        licenseNumber: "LPC-12345",
        featureLabel: "Pipeline Health",
        nested: { email: "jane@example.com", statusCode: 500 },
      },
      contexts: { candidate: { phone: "555-0100", track: "Clinical" } },
      tags: { authToken: "xyz", environment: "production" },
    } as unknown as ErrorEvent;

    const out = scrubEvent(event);

    expect(out.extra).toEqual({
      candidateName: "[Filtered]",
      licenseNumber: "[Filtered]",
      featureLabel: "Pipeline Health",
      nested: { email: "[Filtered]", statusCode: 500 },
    });
    expect(out.contexts).toEqual({ candidate: { phone: "[Filtered]", track: "Clinical" } });
    expect(out.tags).toEqual({ authToken: "[Filtered]", environment: "production" });
  });

  it("never touches the exception/message — stack traces carry no PII by construction", () => {
    const event = {
      exception: { values: [{ type: "TypeError", value: "Cannot read properties of undefined" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.exception).toEqual(event.exception);
  });

  it("scrubs breadcrumb data reachable through the event too", () => {
    const event = {
      breadcrumbs: [
        { category: "fetch", data: { url: "/api/notes", email: "jane@example.com" } },
      ] as Breadcrumb[],
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.breadcrumbs?.[0]?.data).toEqual({ url: "/api/notes", email: "[Filtered]" });
  });

  it("is a no-op when the event carries none of these fields", () => {
    const event = { message: "Something broke" } as unknown as ErrorEvent;
    expect(scrubEvent(event)).toEqual(event);
  });
});

describe("scrubBreadcrumb", () => {
  it("deep-redacts breadcrumb data", () => {
    const breadcrumb = {
      category: "ui.click",
      data: { candidateEmail: "jane@example.com", buttonId: "save" },
    } as Breadcrumb;
    const out = scrubBreadcrumb(breadcrumb);
    expect(out.data).toEqual({ candidateEmail: "[Filtered]", buttonId: "save" });
  });

  it("truncates long console breadcrumb messages", () => {
    const breadcrumb = { category: "console", message: "x".repeat(500) } as Breadcrumb;
    const out = scrubBreadcrumb(breadcrumb);
    expect(out.message).toHaveLength(200);
  });

  it("leaves a short console message and non-console categories alone", () => {
    const consoleCrumb = { category: "console", message: "short" } as Breadcrumb;
    expect(scrubBreadcrumb(consoleCrumb).message).toBe("short");

    const navCrumb = { category: "navigation", data: { to: "/candidates" } } as Breadcrumb;
    expect(scrubBreadcrumb(navCrumb)).toEqual(navCrumb);
  });
});
