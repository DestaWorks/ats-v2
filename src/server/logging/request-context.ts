import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { registerLogContextProvider, type LogContext } from "@/lib/logger";

const storage = new AsyncLocalStorage<LogContext>();

registerLogContextProvider(() => storage.getStore());

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return storage.run({ ...context }, fn);
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore();
}

export function setLogContext(patch: LogContext): void {
  const store = storage.getStore();
  if (!store) return;
  Object.assign(store, patch);
}
