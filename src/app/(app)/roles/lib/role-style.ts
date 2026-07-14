import type { RolePriority, RoleStatus } from "@/lib/constants";
import type { BadgeTone } from "@/components/ui/badge";

/** Badge tone per role status — shared by the board cards and the detail header. */
export const STATUS_TONE: Record<RoleStatus, BadgeTone> = {
  Open: "success",
  "On Hold": "amber",
  Filled: "navy",
  Closed: "neutral",
};

/** Badge tone per role priority. */
export const PRIORITY_TONE: Record<RolePriority, BadgeTone> = {
  P1: "danger",
  P2: "navy",
  P3: "neutral",
};
