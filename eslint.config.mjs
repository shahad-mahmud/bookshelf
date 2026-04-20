import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/db/client-system",
              importNames: ["dbSystem"],
              message:
                "dbSystem bypasses RLS. Use dbAsUser() in app code. dbSystem is for scripts/ and db/seed.ts only.",
            },
            {
              name: "@/db/client-server",
              importNames: ["dbSystem"],
              message:
                "dbSystem bypasses RLS. Use dbAsUser() in app code. dbSystem is for scripts/ and db/seed.ts only.",
            },
            {
              name: "resend",
              message:
                "Import resend only inside lib/email/. Use the email helpers from @/lib/email instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/email/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
