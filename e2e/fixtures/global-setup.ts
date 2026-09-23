/** Runs before the web servers start, so nothing connects to a database it should not touch. */
import { assertDisposableDatabase } from "./guard-database";

export default function globalSetup(): void {
  assertDisposableDatabase();
}
