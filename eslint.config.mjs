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

  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "index.html", "src/generated/**"],
  },
];

export default eslintConfig;
