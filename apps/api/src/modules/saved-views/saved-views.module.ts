import { Module } from "@nestjs/common";
import { savedViewService } from "@destaworks/application/saved-view.service";
import { provideService } from "../service-token";
import { SavedViewsController } from "./saved-views.controller";
import { SAVED_VIEW_SERVICE } from "./saved-views.tokens";

export { SAVED_VIEW_SERVICE } from "./saved-views.tokens";

/**
 * Shareable saved filter state. It is a table plus URL `searchParams` rather than
 * `localStorage` precisely so a view can be linked and reloaded (CONVENTIONS §5).
 */
@Module({
  controllers: [SavedViewsController],
  providers: [provideService(SAVED_VIEW_SERVICE, savedViewService)],
  exports: [SAVED_VIEW_SERVICE],
})
export class SavedViewsModule {}
