/**
 * Domain constants — the shared, isomorphic vocabulary of the ATS.
 * Pure data + type guards, safe to import from client and server.
 * Business logic that *uses* these lives in `server/rules`.
 */

export * from "./pipeline-status";
export * from "./roles";
export * from "./candidate";
export * from "./clients";
export * from "./documents";
export * from "./states";
export * from "./lead-status";
export * from "./notes";
export * from "./audit";
export * from "./open-role";
export * from "./saved-view";
export * from "./nppes";
export * from "./screening";
export * from "./templates";
