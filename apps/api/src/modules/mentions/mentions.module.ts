import { Module } from "@nestjs/common";
import { mentionService } from "@destaworks/application/mention.service";
import { provideService } from "../service-token";
import { MentionsController } from "./mentions.controller";
import { MENTION_SERVICE } from "./mentions.tokens";

export { MENTION_SERVICE };

/** @-mentions of teammates in notes, and the reads that turn them into a personal inbox. */
@Module({
  controllers: [MentionsController],
  providers: [provideService(MENTION_SERVICE, mentionService)],
  exports: [MENTION_SERVICE],
})
export class MentionsModule {}
