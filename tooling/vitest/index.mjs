import path from "node:path";
import { defineConfig } from "vitest/config";

export function createVitestConfig({ root }) {
  return defineConfig({
    test: {
      environment: "node",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      globals: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(root, "src"),
      },
    },
  });
}
