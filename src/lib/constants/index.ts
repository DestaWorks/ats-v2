/**
 * Domain constants — the shared, isomorphic vocabulary of the ATS.
 * Pure data + type guards, safe to import from client and server.
 * Business logic that *uses* these lives in `server/rules`.
 */

export * from "./pipeline-status";
export * from "./roles";
export * from "./candidate";
export * from "./states";
export * from "./lead-status";
