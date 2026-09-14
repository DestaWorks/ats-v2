import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import type { Capability } from "@destaworks/domain/constants";

/** Metadata key `CapabilityGuard` reads the required capability from. */
export const CAPABILITY_METADATA = "destaworks:capability";

/**
 * Declare the capability a handler requires — `@RequireCapability("viewReports")`.
 *
 * The parameter is the `Capability` union, so a typo is a compile error and a role name is not
 * expressible here at all. That is the point: "leadership" and "admin" are capability groups,
 * never hardcoded role lists (DECISIONS D3), which is what lets Phase 6 move `role` onto a
 * membership without revisiting a single route.
 */
export const RequireCapability = (capability: Capability): CustomDecorator<string> =>
  SetMetadata(CAPABILITY_METADATA, capability);
