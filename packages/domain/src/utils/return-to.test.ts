import { describe, it, expect } from "vitest";
import { safeReturnTo } from "./return-to";

const ALLOWED = ["https://admin.desta.works", "https://desta.works"];

describe("safeReturnTo", () => {
  it("allows an origin the deployment names", () => {
    expect(safeReturnTo("https://admin.desta.works/tenants", ALLOWED)).toBe(
      "https://admin.desta.works/tenants",
    );
  });

  it("refuses an origin it does not", () => {
    expect(safeReturnTo("https://evil.example/steal", ALLOWED)).toBeNull();
    expect(safeReturnTo("https://admin.desta.works.evil.example", ALLOWED)).toBeNull();
  });

  it("allows a relative path, which cannot leave the app", () => {
    expect(safeReturnTo("/pipeline?q=jane", ALLOWED)).toBe("/pipeline?q=jane");
  });

  it("refuses a protocol-relative path, which a browser treats as another host", () => {
    expect(safeReturnTo("//evil.example/steal", ALLOWED)).toBeNull();
  });

  it("refuses a non-http scheme", () => {
    expect(safeReturnTo("javascript:alert(1)", ALLOWED)).toBeNull();
    expect(safeReturnTo("data:text/html,x", ALLOWED)).toBeNull();
  });

  it("refuses nonsense and nothing", () => {
    expect(safeReturnTo("not a url", ALLOWED)).toBeNull();
    expect(safeReturnTo(undefined, ALLOWED)).toBeNull();
    expect(safeReturnTo("", ALLOWED)).toBeNull();
  });

  it("never honours a wildcard entry, which development config may contain", () => {
    expect(safeReturnTo("http://localhost:9999/x", ["http://localhost:*"])).toBeNull();
  });
});
