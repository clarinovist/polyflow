import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "scripts/**",
    "coverage/**",
  ]),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ]
    }
  },
  {
    files: ["**/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  // Phase F guardrail: business errors must use ApplicationError hierarchy so
  // safeAction surfaces the real message (not "An unexpected error occurred").
  // See docs/plans/2026-07-13-safeaction-business-error-surfacing.md
  {
    files: ["src/services/**/*.{ts,tsx}", "src/actions/**/*.{ts,tsx}"],
    ignores: [
      "**/__tests__/**",
      "**/*.test.ts",
      "**/*.spec.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ThrowStatement > NewExpression[callee.name='Error']",
          message:
            "Use ApplicationError subclasses (BusinessRuleError, NotFoundError, ValidationError, …) so safeAction surfaces the message to the UI. Do not throw new Error() for user-facing validation.",
        },
      ],
    },
  },
]);

export default eslintConfig;
