import { describe, it, expect } from "vitest";
import { AppError } from "@destaworks/integrations/http/app-error";
import { callAuthApi } from "./api-error";

/** Mirrors better-call's shape: a numeric `statusCode` plus a `body`. */
const authError = (statusCode: number, message?: string) =>
  Object.assign(new Error(message ?? "upstream"), { statusCode, body: { message } });

describe("callAuthApi", () => {
  it("passes a successful call straight through", async () => {
    await expect(callAuthApi(async () => "ok")).resolves.toBe("ok");
  });

  it("turns a taken email into CONFLICT rather than an opaque fault", async () => {
    await expect(
      callAuthApi(async () => {
        throw authError(422, "User already exists");
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each([
    [400, "BAD_REQUEST"],
    [401, "UNAUTHORIZED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [429, "RATE_LIMITED"],
  ])("maps %i to %s", async (status, code) => {
    await expect(
      callAuthApi(async () => {
        throw authError(status);
      }),
    ).rejects.toMatchObject({ code });
  });

  it("never repeats the upstream message, which can echo the rejected value", async () => {
    const caught = await callAuthApi(async () => {
      throw authError(422, "User already exists: patient@example.com");
    }).catch((err: unknown) => err as AppError);

    expect(caught.message).not.toContain("patient@example.com");
  });

  it("rethrows a status it does not recognise, so a real fault stays a 500", async () => {
    await expect(
      callAuthApi(async () => {
        throw authError(500, "boom");
      }),
    ).rejects.not.toBeInstanceOf(AppError);
  });

  it("rethrows anything that is not an auth API error", async () => {
    const plain = new Error("plain");
    await expect(
      callAuthApi(async () => {
        throw plain;
      }),
    ).rejects.toBe(plain);
  });
});
