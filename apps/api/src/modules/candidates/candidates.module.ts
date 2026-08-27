import { Module } from "@nestjs/common";
import { candidateService } from "@destaworks/application/candidate.service";
import { noteService } from "@destaworks/application/note.service";
import { similarityService } from "@destaworks/application/similarity.service";
import { provideService, serviceToken } from "../service-token";

export const CANDIDATE_SERVICE = serviceToken<typeof candidateService>("CANDIDATE_SERVICE");
export const NOTE_SERVICE = serviceToken<typeof noteService>("NOTE_SERVICE");
export const SIMILARITY_SERVICE = serviceToken<typeof similarityService>("SIMILARITY_SERVICE");

/**
 * The pipeline's central entity: candidates, the notes recorded against them, and the
 * similarity search that backs sourcing's "find more like this".
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [
    provideService(CANDIDATE_SERVICE, candidateService),
    provideService(NOTE_SERVICE, noteService),
    provideService(SIMILARITY_SERVICE, similarityService),
  ],
  exports: [CANDIDATE_SERVICE, NOTE_SERVICE, SIMILARITY_SERVICE],
})
export class CandidatesModule {}
