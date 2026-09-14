import { Module } from "@nestjs/common";
import { candidateService } from "@destaworks/application/candidate.service";
import { noteService } from "@destaworks/application/note.service";
import { similarityService } from "@destaworks/application/similarity.service";
import { provideService } from "../service-token";
import { CANDIDATE_SERVICE, NOTE_SERVICE, SIMILARITY_SERVICE } from "./candidates.tokens";
import { LookupsModule } from "../lookups/lookups.module";
import { ResumeModule } from "../resume/resume.module";
import { CandidatesController } from "./candidates.controller";

export { CANDIDATE_SERVICE, NOTE_SERVICE, SIMILARITY_SERVICE } from "./candidates.tokens";

/**
 * The pipeline's central entity: candidates, the notes recorded against them, and the
 * similarity search that backs sourcing's "find more like this".
 *
 * `ResumeModule` is imported for `POST /candidates/:id/resume`: attaching a resume to an
 * already-known candidate is a candidate route, but the work belongs to the resume service, and one
 * service keeps one owning module rather than being bound to a second token here.
 *
 * `LookupsModule` is imported for the same reason, by `GET /candidates/:id/detail`: the detail page
 * needs the client and @mention option lists in the same response, and reusing the lookup service
 * keeps one definition of what a filter option is.
 */
@Module({
  imports: [LookupsModule, ResumeModule],
  controllers: [CandidatesController],
  providers: [
    provideService(CANDIDATE_SERVICE, candidateService),
    provideService(NOTE_SERVICE, noteService),
    provideService(SIMILARITY_SERVICE, similarityService),
  ],
  exports: [CANDIDATE_SERVICE, NOTE_SERVICE, SIMILARITY_SERVICE],
})
export class CandidatesModule {}
