import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("findHunterContacts", () => {
  const fetchMock = vi.fn();
  const originalKey = process.env.HUNTER_API_KEY;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.HUNTER_API_KEY = originalKey;
  });

  it("hunterEnabled is false and findHunterContacts throws FEATURE_DISABLED when HUNTER_API_KEY is unset", async () => {
    delete process.env.HUNTER_API_KEY;
    const { hunterEnabled, findHunterContacts } = await import("./hunter");
    expect(hunterEnabled).toBe(false);
    await expect(findHunterContacts({ domain: "sterling.example" })).rejects.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Hunter domain-search emails when HUNTER_API_KEY is set", async () => {
    process.env.HUNTER_API_KEY = "test-key";
    const { findHunterContacts } = await import("./hunter");
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          emails: [
            {
              first_name: "Jane",
              last_name: "Doe",
              position: "Practice Manager",
              value: "jane@sterling.example",
              phone_number: "+15551234567",
              linkedin: "https://linkedin.com/in/janedoe",
              seniority: "manager",
            },
          ],
        },
      }),
    );
    const contacts = await findHunterContacts({ domain: "sterling.example" });
    expect(contacts).toEqual([
      {
        fullName: "Jane Doe",
        title: "Practice Manager",
        email: "jane@sterling.example",
        phone: "+15551234567",
        linkedinUrl: "https://linkedin.com/in/janedoe",
        seniority: "manager",
      },
    ]);
  });

  it("throws UPSTREAM_ERROR on a non-OK response", async () => {
    process.env.HUNTER_API_KEY = "test-key";
    const { findHunterContacts } = await import("./hunter");
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(findHunterContacts({ domain: "sterling.example" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });

  it("throws UPSTREAM_ERROR when the fetch rejects (network error / abort)", async () => {
    process.env.HUNTER_API_KEY = "test-key";
    const { findHunterContacts } = await import("./hunter");
    fetchMock.mockRejectedValue(new Error("aborted"));
    await expect(findHunterContacts({ domain: "sterling.example" })).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    });
  });
});
