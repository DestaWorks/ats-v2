import { setLoggerAdapter } from "./";
import { createPinoLogger } from "./pino-logger";
import "./request-context";

export function installNodeLogger(): void {
  setLoggerAdapter(createPinoLogger());
}
