import { getPlatformIdentity } from "@destaworks/auth/platform-guards";
import { logger } from "@destaworks/config/logger";
import { gateFor, type PlatformGate } from "./platform-gate";

/** The gate for this request. A refusal is logged by user id — never by email or name. */
export async function platformGate(): Promise<PlatformGate> {
  const gate = gateFor(await getPlatformIdentity());
  if (gate.outcome === "refused") {
    logger.warn("platform.console.refused", { reason: "not-on-platform-allowlist" });
  }
  return gate;
}
