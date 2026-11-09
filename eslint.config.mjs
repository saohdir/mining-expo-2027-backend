// NFR-11: lint rules for the Next.js app (flat config). `npm run lint` runs in CI.
import {dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {FlatCompat} from "@eslint/eslintrc";
const compat = new FlatCompat({baseDirectory: dirname(fileURLToPath(import.meta.url))});
export default [
  {ignores: [".next/**", "node_modules/**", "next-env.d.ts", "coverage/**"]},
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {rules: {
    // Existing code uses compact one-line modules; keep these as warnings, everything else is an error.
    "@typescript-eslint/no-unused-vars": ["warn", {argsIgnorePattern: "^_", varsIgnorePattern: "^_"}],
    "@typescript-eslint/no-explicit-any": "warn",
    "react-hooks/exhaustive-deps": "warn",
    "@next/next/no-img-element": "off",
    // "/" and the marketing pages are the static site served by nginx, not Next.js routes — plain <a> is correct there.
    "@next/next/no-html-link-for-pages": "off"
  }}
];
