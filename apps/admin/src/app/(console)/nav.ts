import type { PlatformCapability } from "@destaworks/domain/platform";

export interface ConsoleNavItem {
  readonly href: string;
  readonly label: string;
  /** The platform capability this destination needs. Never a role name. */
  readonly capability: PlatformCapability;
}

export const CONSOLE_NAV: readonly ConsoleNavItem[] = [
  { href: "/tenants", label: "Tenants", capability: "viewTenants" },
  { href: "/health", label: "Health", capability: "viewTenants" },
  { href: "/metrics", label: "Platform metrics", capability: "viewTenants" },
  { href: "/impersonation", label: "Support access", capability: "readTenantData" },
];
