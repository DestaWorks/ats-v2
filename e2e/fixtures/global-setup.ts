/** Runs before the web servers start, so nothing connects to a database it should not touch. */
import { assertDisposableDatabase } from "./guard-database";
import { prepareStorage } from "./storage-setup";

export default async function globalSetup(): Promise<void> {
  assertDisposableDatabase();
  await prepareStorage();
}
