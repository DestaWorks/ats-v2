import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // --- Layer boundaries (DECISIONS: no-server-in-client) ---
  // The isomorphic lib must never import server-only code.
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

  // Client/UI code must not import server/**. The exempted filenames are the App Router's
  // server-side entry points (RSC pages/layouts, route handlers, server actions, their
  // `load-detail` loaders) and route tests — everything else under app/ + components/ is
  // client-side and reaches the server over HTTP, not by import.
  {
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    ignores: [
      "src/app/**/page.tsx",
      "src/app/**/layout.tsx",
      "src/app/**/route.ts",
      "src/app/**/actions.ts",
      "src/app/**/load-detail.ts",
      "src/app/request-context.ts",
      "src/app/**/*.{test,spec}.{ts,tsx}",
    ],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["./src/app", "./src/components"],
              from: "./src/server",
              message:
                "Client/UI code must not import server/** — call the API route, or take the data as a prop from the RSC page. Shared types belong in lib/**.",
            },
          ],
        },
      ],
    },
  },

  // No database access outside the repository layer (STACK-ARCHITECTURE: route → service →
  // repository → prisma). `server/auth` is exempt: Better Auth's prismaAdapter owns the
  // User/Session tables and must be handed the client itself.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/repositories/**", "src/server/db/**", "src/server/auth/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/db/prisma", "**/server/db/prisma"],
              message:
                "The Prisma client is repository-layer only — add/reuse a repository method instead of querying from here.",
            },
            {
              group: ["**/generated/prisma/client", "@prisma/client"],
              importNames: ["PrismaClient", "default"],
              message:
                "Only src/server/db/prisma.ts may instantiate the generated Prisma client. The `Prisma` namespace (types + error classes) is fine.",
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
  // The console adapter IS the sanctioned console call site — it is what the Edge runtime logs
  // through, since pino cannot run there. Exempted here rather than disabled inline, so the one
  // exception lives beside the rule.
  {
    files: ["src/lib/logger/console-logger.ts"],
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
