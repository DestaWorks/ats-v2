import { Body, Controller, HttpCode, Inject, Post, UseGuards } from "@nestjs/common";
import {
  parseResumeInputSchema,
  requestResumeUploadUrlSchema,
  saveResumeInputSchema,
} from "@destaworks/contracts/validation/resume";
import type {
  ExtractResumeResponse,
  ResumeUploadUrlDTO,
} from "@destaworks/contracts/validation/resume";
import type { ResumeSaveEnvelope } from "@destaworks/application/candidate.wire";
import type { AuthContext } from "@destaworks/auth/guards";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RateLimit } from "../../common/decorators/rate-limit.decorator";
import { RateLimitGuard } from "../../common/guards/rate-limit.guard";
import { SessionAuthGuard } from "../../common/guards/session-auth.guard";
import { ZodValidationPipe, type ContractOutput } from "../../common/pipes/zod-validation.pipe";
import type { ServiceOf } from "../service-token";
import { RESUME_SERVICE } from "./resume.tokens";

/**
 * The Parse Resume flow: extract structured data from a resume, get a signed URL to upload the raw
 * bytes, and persist the reviewed result as a candidate plus its document.
 *
 * Open to any signed-in user, matching the candidate pipeline. Two of the three endpoints are rate
 * limited because each one costs real money or a real Storage round trip, and `RateLimitGuard`
 * is listed after `SessionAuthGuard` so the bucket is keyed per user rather than shared.
 */
@Controller("resume")
@UseGuards(SessionAuthGuard, RateLimitGuard)
export class ResumeController {
  constructor(@Inject(RESUME_SERVICE) private readonly resumes: ServiceOf<typeof RESUME_SERVICE>) {}

  /**
   * POST /resume/extract — structured extraction of a pasted or client-extracted resume. Writes
   * NOTHING: it answers with the structured data plus the server-computed match for the review UI.
   * With no model key configured the service throws `FEATURE_DISABLED`, which the filter renders 503.
   */
  @Post("extract")
  @HttpCode(200)
  @RateLimit({ name: "resume-extract", limit: 20, windowMs: 60_000 })
  async extract(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(parseResumeInputSchema))
    body: ContractOutput<typeof parseResumeInputSchema>,
  ): Promise<ExtractResumeResponse> {
    return this.resumes.extract(user, body);
  }

  /**
   * POST /resume/save — attach a reviewed resume to an existing candidate or create a new one, store
   * the document and audit, in one transaction. The match and any `confirmedCandidateId` are
   * recomputed server-side; the client's view of them is never trusted.
   */
  @Post("save")
  @HttpCode(200)
  async save(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(saveResumeInputSchema))
    body: ContractOutput<typeof saveResumeInputSchema>,
  ): Promise<ResumeSaveEnvelope> {
    return this.resumes.save(user, body);
  }

  /**
   * POST /resume/upload-url — a short-lived signed URL the browser PUTs the raw bytes to directly.
   * The file never passes through this process.
   */
  @Post("upload-url")
  @HttpCode(200)
  @RateLimit({ name: "resume-upload-url", limit: 20, windowMs: 60_000 })
  async uploadUrl(
    @CurrentUser() user: AuthContext,
    @Body(new ZodValidationPipe(requestResumeUploadUrlSchema))
    body: ContractOutput<typeof requestResumeUploadUrlSchema>,
  ): Promise<ResumeUploadUrlDTO> {
    return this.resumes.requestUploadUrl(user, body);
  }
}
