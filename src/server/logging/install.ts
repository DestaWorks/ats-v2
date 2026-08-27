import { setLoggerAdapter } from "@/lib/logger";
import { createPinoLogger } from "./pino-logger";
import "./request-context";

export function installNodeLogger(): void {
  setLoggerAdapter(createPinoLogger());
}
