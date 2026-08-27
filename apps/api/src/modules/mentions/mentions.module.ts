import { Module } from "@nestjs/common";
import { mentionService } from "@destaworks/application/mention.service";
import { provideService, serviceToken } from "../service-token";

export const MENTION_SERVICE = serviceToken<typeof mentionService>("MENTION_SERVICE");

/**
 * @-mentions of teammates in notes, and the reads that turn them into a personal inbox.
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(MENTION_SERVICE, mentionService)],
  exports: [MENTION_SERVICE],
})
export class MentionsModule {}
