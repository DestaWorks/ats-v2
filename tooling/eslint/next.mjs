import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/** @type {import("eslint").Linter.Config[]} */
const nextConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  {
    rules: {
      // Ban raw-HTML injection app-wide — the load-bearing guard for the notes stored-XSS fix
      // (Wave 2.2) and everywhere user/candidate text renders. Use escaped React children instead.
      "react/no-danger": "error",
    },
  },
];

export default nextConfig;
