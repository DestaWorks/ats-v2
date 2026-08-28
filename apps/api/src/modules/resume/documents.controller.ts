import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import type { DownloadUrlEnvelope } from "@destaworks/contracts/validation/envelopes";
import { RequireCapability } from "../../common/decorators/require-capability.decorator";
import { CapabilityGuard } from "../../common/guards/capability.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import type { ServiceOf } from "../service-token";
import { RESUME_SERVICE } from "./resume.tokens";

/**
 * Stored documents. One endpoint, and it hands out access to the raw resume bytes, so it sits at
 * the same `viewCredentials` tier that already protects `extractedText` and `extractedData` — the
 * original file carries exactly the same PII/PHI as the text pulled out of it.
 *
 * It lives in the resume module because `resumeService` owns document storage; a folder per URL
 * segment would split one service across two modules for no gain.
 */
@Controller("documents")
@UseGuards(SessionAuthGuard, CapabilityGuard)
export class DocumentsController {
  constructor(@Inject(RESUME_SERVICE) private readonly resumes: ServiceOf<typeof RESUME_SERVICE>) {}

  /**
   * GET /documents/:id/download-url — a fresh, short-lived signed URL for a document's stored bytes.
   * 404s when the row has no `storageKey`, i.e. metadata-only and legacy-link documents.
   */
  @Get(":id/download-url")
  @RequireCapability("viewCredentials")
  async downloadUrl(@Param("id") id: string): Promise<DownloadUrlEnvelope> {
    return this.resumes.getDownloadUrl(id);
  }
}
