// ESLint flat config (ESLint 9 + typescript-eslint).
// Run with: npm run lint   (auto-fix: npm run lint:fix)
const js = require("@eslint/js");
const tseslint = require("typescript-eslint");
const globals = require("globals");

module.exports = tseslint.config(
  // Don't lint generated output or dependencies.
  { ignores: ["dist/**", "node_modules/**"] },

  // Base recommended rules.
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project source: browser + Office.js globals.
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        Office: "readonly",
        Word: "readonly",
        OfficeExtension: "readonly",
      },
    },
    rules: {
      // POC code logs to the console on purpose.
      "no-console": "off",
      // Allow intentionally-unused args/vars when prefixed with _.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
