import pino, { type DestinationStream, type Logger as PinoInstance } from "pino";
import { PINO_REDACT_PATHS, REDACTED } from "@/lib/logger/redact";
import { resolveLevel, type LogFields, type Logger } from "@/lib/logger/types";

export interface PinoLoggerOptions {
  level?: string;
  destination?: DestinationStream;
  pretty?: boolean;
}

function shouldPretty(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.LOG_PRETTY !== "0";
}

function wrap(instance: PinoInstance): Logger {
  return {
    debug: (event, fields) => instance.debug(fields ?? {}, event),
    info: (event, fields) => instance.info(fields ?? {}, event),
    warn: (event, fields) => instance.warn(fields ?? {}, event),
    error: (event, fields) => instance.error(fields ?? {}, event),
    child: (fields: LogFields) => wrap(instance.child(fields)),
  };
}

export function createPinoLogger(options: PinoLoggerOptions = {}): Logger {
  const base: pino.LoggerOptions = {
    level:
      options.level ??
      resolveLevel({ LOG_LEVEL: process.env.LOG_LEVEL, NODE_ENV: process.env.NODE_ENV }),
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: { paths: [...PINO_REDACT_PATHS], censor: REDACTED },
    serializers: {
      err: (value: unknown) => ({ type: (value as Error | undefined)?.name ?? "Error" }),
      error: (value: unknown) => ({ type: (value as Error | undefined)?.name ?? "Error" }),
    },
  };

  if (options.destination) return wrap(pino(base, options.destination));

  const pretty = options.pretty ?? shouldPretty();
  if (pretty) {
    try {
      return wrap(
        pino({
          ...base,
          transport: { target: "pino-pretty", options: { colorize: true, singleLine: false } },
        }),
      );
    } catch {
      return wrap(pino(base));
    }
  }

  return wrap(pino(base));
}
