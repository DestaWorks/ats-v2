import { Module } from "@nestjs/common";
import { savedViewService } from "@destaworks/application/saved-view.service";
import { provideService, serviceToken } from "../service-token";

export const SAVED_VIEW_SERVICE = serviceToken<typeof savedViewService>("SAVED_VIEW_SERVICE");

/**
 * Shareable saved filter state. It is a table plus URL `searchParams` rather than
 * `localStorage` precisely so a view can be linked and reloaded (CONVENTIONS §5).
 *
 * Wiring only until Phase 4.3 adds the controllers: the services are bound to tokens and exported,
 * so a controller injects one instead of importing the singleton and becoming untestable.
 */
@Module({
  providers: [provideService(SAVED_VIEW_SERVICE, savedViewService)],
  exports: [SAVED_VIEW_SERVICE],
})
export class SavedViewsModule {}
