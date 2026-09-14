import { Module } from "@nestjs/common";
import { resumeService } from "@destaworks/application/resume.service";
import { provideService } from "../service-token";
import { RESUME_SERVICE } from "./resume.tokens";
import { DocumentsController } from "./documents.controller";
import { ResumeController } from "./resume.controller";

export { RESUME_SERVICE } from "./resume.tokens";

/**
 * Resume upload, parsing and matching — the AI-assisted path from an uploaded document to a
 * candidate record.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  controllers: [ResumeController, DocumentsController],
  providers: [provideService(RESUME_SERVICE, resumeService)],
  exports: [RESUME_SERVICE],
})
export class ResumeModule {}
