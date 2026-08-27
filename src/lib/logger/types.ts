export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

export type LogThreshold = LogLevel | "silent";

const ORDER: Record<LogThreshold, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export function isLevelEnabled(level: LogLevel, threshold: LogThreshold): boolean {
  return ORDER[level] >= ORDER[threshold];
}

export function resolveLevel(env: {
  LOG_LEVEL?: string | undefined;
  NODE_ENV?: string | undefined;
}): LogThreshold {
  const raw = env.LOG_LEVEL;
  if (raw && raw in ORDER) return raw as LogThreshold;
  if (env.NODE_ENV === "test") return "warn";
  return env.NODE_ENV === "production" ? "info" : "debug";
}
