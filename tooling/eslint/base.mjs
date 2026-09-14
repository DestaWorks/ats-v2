import eslintComments from "eslint-plugin-eslint-comments";

/** The server-only packages (Phase 2 moved `src/server/**` here package by package). These are
 *  what the layer zones below forbid client/UI and isomorphic code from importing. */
const SERVER_PACKAGES = [
  "./packages/application",
  "./packages/auth",
  "./packages/db",
  "./packages/integrations",
];

/** @type {import("eslint").Linter.Config[]} */
const baseConfig = [
  // --- Layer boundaries (DECISIONS: no-server-in-client) ---
  // The isomorphic lib must never import server-only code.
  {
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["./packages/domain", "./packages/contracts"],
              from: SERVER_PACKAGES,
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
    files: ["apps/*/src/app/**/*.{ts,tsx}", "apps/*/src/components/**/*.{ts,tsx}"],
    ignores: [
      "apps/*/src/app/**/page.tsx",
      "apps/*/src/app/**/layout.tsx",
      "apps/*/src/app/**/route.ts",
      "apps/*/src/app/**/actions.ts",
      "apps/*/src/app/**/load-detail.ts",
      "apps/*/src/app/request-context.ts",
      "apps/*/src/app/**/*.{test,spec}.{ts,tsx}",
    ],
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: ["./apps/web/src/app", "./apps/web/src/components"],
              from: SERVER_PACKAGES,
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
    files: ["packages/**/*.{ts,tsx}", "apps/**/*.{ts,tsx}"],
    ignores: ["packages/db/**", "packages/auth/**"],
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
  // Type-safety rules that were previously true only because reviewers enforced them. `any` and a
  // non-null assertion each discard a guarantee the compiler was giving; an `as` cast at least has
  // to say why (CONVENTIONS §2). An eslint-disable without a reason is the same class of problem —
  // it silences a rule and leaves nobody able to judge whether it should have.
  {
    plugins: { "eslint-comments": eslintComments },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "eslint-comments/require-description": ["error", { ignore: [] }],
      "eslint-comments/no-unused-disable": "error",
    },
  },
  // Tests build their own fixtures and then index into them; under `noUncheckedIndexedAccess`
  // every `rows[0]` is `T | undefined`, so `!` there asserts something the test just constructed.
  // The rule is about production code silencing a nullable it has not actually ruled out.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx", "scripts/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },

  // The console adapter IS the sanctioned console call site — it is what the Edge runtime logs
  // through, since pino cannot run there. Exempted here rather than disabled inline, so the one
  // exception lives beside the rule.
  {
    files: ["packages/config/src/logger/console-logger.ts"],
    rules: { "no-console": "off" },
  },

  {
    ignores: [
      "**/.next/**",
      "**/dist/**",
      "**/node_modules/**",
      ".claude/**",
      "internal-docs/**",
      "**/next-env.d.ts",
      "index.html",
      "**/generated/**",
    ],
  },
];

export default baseConfig;
