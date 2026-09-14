import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { assertModule } from "@destaworks/auth/guards";
import type { ModuleViewer } from "@destaworks/domain/tenant";
import type { Module } from "@destaworks/domain/constants";
import { MODULE_METADATA } from "../decorators/require-module.decorator";

/**
 * Enforce a handler's `@RequireModule(...)` against an already-resolved context, so a guard pays
 * for one tenant resolution rather than two.
 *
 * Shared by both guards because a `@RequireModule` under the one that did not read it would
 * silently enforce nothing. `check-module-gates.mjs` proves an enforcing guard is always attached.
 */
export function enforceDeclaredModule(
  reflector: Reflector,
  context: ExecutionContext,
  viewer: ModuleViewer,
): void {
  const required = reflector.getAllAndOverride<Module | undefined>(MODULE_METADATA, [
    context.getHandler(),
    context.getClass(),
  ]);
  if (required !== undefined) assertModule(viewer, required);
}
