import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

/**
 * Contract test for `ResumeController` and `DocumentsController` — the parity gate for the Parse
 * Resume flow and the document download URL (SAAS-RESTRUCTURE-PLAN 4.3).
 *
 * The interesting difference between the two controllers is their authorization posture, and both
 * halves are asserted: the resume flow is open to any signed-in operator, while the download URL is
 * `viewCredentials`-gated because a stored resume carries the same PII/PHI as the text extracted
 * from it — so an authenticated caller WITHOUT the capability is refused, and never reaches storage.
 */

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; email: string; name: string; role?: string } } | null,
  resume: {
    extract: vi.fn(),
    save: vi.fn(),
    requestUploadUrl: vi.fn(),
    getDownloadUrl: vi.fn(),
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@destaworks/auth/auth", () => ({ auth: { api: { getSession: async () => h.session } } }));
vi.mock("@destaworks/db/memberships", async () => ({
  membershipReader: (
    await import("@destaworks/auth/testing/membership-double")
  ).singleTenantMembershipReader(() => h.session),
}));
vi.mock("@destaworks/db/prisma", () => ({ prisma: {} }));
vi.mock("@destaworks/application/resume.service", () => ({ resumeService: h.resume }));

import {
  jsonBody,
  startContractHost,
  type ContractHost,
  type ErrorEnvelope,
} from "../../common/testing/contract-host";
import { ResumeModule } from "./resume.module";

/** 50 characters is `parseResumeInputSchema`'s floor; anything shorter is a 422 by contract. */
const RESUME_TEXT = "Jane Doe, PMHNP-BC. Ten years of outpatient psychiatric care in Austin, TX.";

let api: ContractHost;

function signInAs(role: string): void {
  h.session = { user: { id: "u1", email: "u@desta.works", name: "Test User", role } };
}

beforeAll(async () => {
  api = await startContractHost(ResumeModule);
});

afterAll(async () => {
  await api.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  signInAs("Associate");
});

describe("POST /resume/extract", () => {
  it("answers 200 with the structured data and the server-computed match", async () => {
    const result = { variant: "clinical", data: { name: "Jane Doe" }, match: { kind: "none" } };
    h.resume.extract.mockResolvedValue(result);
    const res = await api.request(
      "/resume/extract",
      jsonBody({ variant: "clinical", text: RESUME_TEXT }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });

  it("rejects a body that fails the contract schema with 422 and never calls the model", async () => {
    const res = await api.request("/resume/extract", jsonBody({ variant: "clinical", text: "hi" }));
    expect(res.status).toBe(422);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("BAD_REQUEST");
    expect(h.resume.extract).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401 before spending a model call", async () => {
    h.session = null;
    const res = await api.request(
      "/resume/extract",
      jsonBody({ variant: "clinical", text: RESUME_TEXT }),
    );
    expect(res.status).toBe(401);
    expect(h.resume.extract).not.toHaveBeenCalled();
  });

  it("renders a disabled feature as 503, not as a server fault", async () => {
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.resume.extract.mockRejectedValue(new AppError("FEATURE_DISABLED", "Resume parsing is off"));
    const res = await api.request(
      "/resume/extract",
      jsonBody({ variant: "clinical", text: RESUME_TEXT }),
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("FEATURE_DISABLED");
  });
});

describe("POST /resume/save", () => {
  const body = {
    variant: "clinical",
    data: { name: "Jane Doe" },
    originalFilename: "cv.pdf",
    mimeType: "application/pdf",
    extractedText: RESUME_TEXT,
  };

  it("answers 200 with the candidate and its document, and passes the viewer through", async () => {
    const saved = { candidate: { id: "c1" }, document: { id: "d1" } };
    h.resume.save.mockResolvedValue(saved);
    const res = await api.request("/resume/save", jsonBody(body));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(saved);
    expect(h.resume.save.mock.calls[0]?.[0]).toMatchObject({ user: { id: "u1" } });
  });

  it("refuses a signed-out caller with 401 and writes nothing", async () => {
    h.session = null;
    const res = await api.request("/resume/save", jsonBody(body));
    expect(res.status).toBe(401);
    expect(h.resume.save).not.toHaveBeenCalled();
  });
});

describe("POST /resume/upload-url", () => {
  it("answers 200 with the signed target and its key", async () => {
    h.resume.requestUploadUrl.mockResolvedValue({ signedUrl: "https://x/put", storageKey: "k" });
    const res = await api.request(
      "/resume/upload-url",
      jsonBody({ filename: "cv.pdf", mimeType: "application/pdf" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedUrl: "https://x/put", storageKey: "k" });
  });

  it("rejects a mime type outside the allowlist with 422", async () => {
    const res = await api.request(
      "/resume/upload-url",
      jsonBody({ filename: "cv.exe", mimeType: "application/x-msdownload" }),
    );
    expect(res.status).toBe(422);
    expect(h.resume.requestUploadUrl).not.toHaveBeenCalled();
  });
});

describe("GET /documents/:id/download-url — the viewCredentials gate", () => {
  it("refuses an authenticated viewer WITHOUT the capability with 403, and reads nothing", async () => {
    signInAs("Associate");
    const res = await api.request("/documents/d1/download-url");
    expect(res.status).toBe(403);
    expect(((await res.json()) as ErrorEnvelope).error.code).toBe("FORBIDDEN");
    expect(h.resume.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller with 401", async () => {
    h.session = null;
    const res = await api.request("/documents/d1/download-url");
    expect(res.status).toBe(401);
    expect(h.resume.getDownloadUrl).not.toHaveBeenCalled();
  });

  it("answers 200 with the signed URL for a viewer who holds the capability", async () => {
    signInAs("Owner");
    h.resume.getDownloadUrl.mockResolvedValue({ url: "https://x/get" });
    const res = await api.request("/documents/d1/download-url");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://x/get" });
  });

  it("renders a document with no stored bytes as 404", async () => {
    signInAs("Owner");
    const { AppError } = await import("@destaworks/integrations/http/app-error");
    h.resume.getDownloadUrl.mockRejectedValue(new AppError("NOT_FOUND", "Document not found"));
    const res = await api.request("/documents/d1/download-url");
    expect(res.status).toBe(404);
  });
});
