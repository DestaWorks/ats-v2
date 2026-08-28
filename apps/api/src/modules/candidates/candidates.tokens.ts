import { candidateService } from "@destaworks/application/candidate.service";
import { noteService } from "@destaworks/application/note.service";
import { similarityService } from "@destaworks/application/similarity.service";
import { serviceToken } from "../service-token";

/**
 * The injection tokens for candidates, declared apart from the module that binds them.
 *
 * They cannot live in `candidates.module.ts`: the module imports its controller and the controller
 * imports these tokens, which is an ES module CYCLE — the token is still in its temporal dead zone
 * at the moment Nest reads the controller's `@Inject` metadata, so the container is handed
 * `undefined` and refuses to resolve the parameter. It fails at boot, as a DI error, with nothing
 * upstream to catch it: not a type error, and not something a controller unit test would see.
 */
export const CANDIDATE_SERVICE = serviceToken<typeof candidateService>("CANDIDATE_SERVICE");
export const NOTE_SERVICE = serviceToken<typeof noteService>("NOTE_SERVICE");
export const SIMILARITY_SERVICE = serviceToken<typeof similarityService>("SIMILARITY_SERVICE");
