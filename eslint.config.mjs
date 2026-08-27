import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // --- Layer boundaries (DECISIONS: no-server-in-client) ---
  // Client feature modules and the isomorphic lib must never import server-only code.
  // The full boundary set (repositories = only Prisma consumer, no upward imports)
  // is added as those layers land; `import "server-only"` guards the rest at build time.
  {
    rules: {
      // Ban raw-HTML injection app-wide — the load-bearing guard for the notes stored-XSS fix
      // (Wave 2.2) and everywhere user/candidate text renders. Use escaped React children instead.
      "react/no-danger": "error",
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/modules",
              from: "./src/server",
              message:
                "Client modules must not import server/** — call the API (or a thin Server Action) instead.",
            },
            {
              target: "./src/lib",
              from: "./src/server",
              message:
                "lib/** is isomorphic (shared client+server) — it must not import server/**.",
            },
          ],
        },
      ],
    },
  },

  // --- Structured logging (Phase 0.9) ---
  // `console.*` is unstructured and unredacted — the one way PII/PHI reaches a log line in an app
  // bound by HIPAA + Proclamation 1321/2024. Use `logger` from `@/lib/logger` instead.
  {
    rules: { "no-console": "error" },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "scripts/**"],
    rules: { "no-console": "off" },
  },

  {
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      ".claude/**",
      "internal-docs/**",
      "next-env.d.ts",
      "index.html",
      "src/generated/**",
    ],
  },
];

export default eslintConfig;
