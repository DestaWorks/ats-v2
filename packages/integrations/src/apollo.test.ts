import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("findApolloContacts", () => {
  const fetchMock = vi.fn();
  const originalKey = process.env.APOLLO_API_KEY;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.APOLLO_API_KEY = originalKey;
  });

  it("apolloEnabled is false and findApolloContacts throws FEATURE_DISABLED when APOLLO_API_KEY is unset", async () => {
    delete process.env.APOLLO_API_KEY;
    const { apolloEnabled, findApolloContacts } = await import("./apollo");
    expect(apolloEnabled).toBe(false);
    await expect(
      findApolloContacts({ organizationName: "Sterling Institute" }),
    ).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps Apollo people results when APOLLO_API_KEY is set", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const { findApolloContacts } = await import("./apollo");
    fetchMock.mockResolvedValue(
      jsonResponse({
        people: [
          {
            name: "Jane Doe",
            title: "Practice Manager",
            email: "jane@sterling.example",
            seniority: "manager",
            linkedin_url: "https://linkedin.com/in/janedoe",
            phone_numbers: [{ sanitized_number: "+15551234567" }],
          },
        ],
      }),
    );
    const contacts = await findApolloContacts({ organizationName: "Sterling Institute" });
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
    process.env.APOLLO_API_KEY = "test-key";
    const { findApolloContacts } = await import("./apollo");
    fetchMock.mockResolvedValue(jsonResponse({}, false));
    await expect(
      findApolloContacts({ organizationName: "Sterling Institute" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });

  it("throws UPSTREAM_ERROR when the fetch rejects (network error / abort)", async () => {
    process.env.APOLLO_API_KEY = "test-key";
    const { findApolloContacts } = await import("./apollo");
    fetchMock.mockRejectedValue(new Error("aborted"));
    await expect(
      findApolloContacts({ organizationName: "Sterling Institute" }),
    ).rejects.toMatchObject({ code: "UPSTREAM_ERROR" });
  });
});
