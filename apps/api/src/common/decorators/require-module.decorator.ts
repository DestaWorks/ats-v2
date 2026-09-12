import { SetMetadata, type CustomDecorator } from "@nestjs/common";
import type { Module } from "@destaworks/domain/constants";

/** Metadata key `CapabilityGuard` reads the required module from. */
export const MODULE_METADATA = "destaworks:module";

/**
 * Declare the module a handler requires — `@RequireModule("reports")`.
 *
 * Sits beside `@RequireCapability`, never instead of it. The module says the tenant bought the
 * feature; the capability says this member may use it. A handler declaring only a module is
 * refused by the guard, the same way one declaring only a capability always has been.
 */
export const RequireModule = (module: Module): CustomDecorator<string> =>
  SetMetadata(MODULE_METADATA, module);
