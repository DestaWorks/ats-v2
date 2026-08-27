import { redactFields } from "./redact";
import {
  isLevelEnabled,
  resolveLevel,
  type LogFields,
  type LogLevel,
  type LogThreshold,
  type Logger,
} from "./types";

export interface ConsoleLoggerOptions {
  level?: LogThreshold;
  write?: (line: string, level: LogLevel) => void;
}

function defaultWrite(line: string, level: LogLevel): void {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function createConsoleLogger(options: ConsoleLoggerOptions = {}): Logger {
  const threshold =
    options.level ??
    resolveLevel({ LOG_LEVEL: process.env.LOG_LEVEL, NODE_ENV: process.env.NODE_ENV });
  const write = options.write ?? defaultWrite;

  function make(bound: LogFields): Logger {
    function emit(level: LogLevel, event: string, fields?: LogFields): void {
      if (!isLevelEnabled(level, threshold)) return;
      const merged = redactFields({ ...bound, ...fields }) as LogFields;
      const line: Record<string, unknown> = {
        level,
        time: new Date().toISOString(),
        msg: event,
      };
      for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined) line[key] = value;
      }
      write(JSON.stringify(line), level);
    }

    return {
      debug: (event, fields) => emit("debug", event, fields),
      info: (event, fields) => emit("info", event, fields),
      warn: (event, fields) => emit("warn", event, fields),
      error: (event, fields) => emit("error", event, fields),
      child: (fields) => make({ ...bound, ...fields }),
    };
  }

  return make({});
}
