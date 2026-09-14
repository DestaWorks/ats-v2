import { createConsoleLogger } from "./console-logger";
import type { LogContext, LogFields, LogLevel, Logger } from "./types";

export type { LogContext, LogFields, LogLevel, LogThreshold, Logger } from "./types";
export { REDACTED, SENSITIVE_KEYS, PINO_REDACT_PATHS, redactFields } from "./redact";
export { createConsoleLogger } from "./console-logger";

let adapter: Logger = createConsoleLogger();
let contextProvider: (() => LogContext | undefined) | undefined;

export function setLoggerAdapter(next: Logger): void {
  adapter = next;
}

export function registerLogContextProvider(provider: () => LogContext | undefined): void {
  contextProvider = provider;
}

export function currentLogContext(): LogContext | undefined {
  return contextProvider?.();
}

function makeLogger(bound: LogFields): Logger {
  function emit(level: LogLevel, event: string, fields?: LogFields): void {
    adapter[level](event, { ...currentLogContext(), ...bound, ...fields });
  }
  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    child: (fields) => makeLogger({ ...bound, ...fields }),
  };
}

export const logger: Logger = makeLogger({});
