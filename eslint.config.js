import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**"],
  },
  {
    files: ["lib/**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: false },
      ],
      "@typescript-eslint/require-await": "error",
    },
  },
  {
    files: ["lib/**/*.d.ts"],
    extends: [...tseslint.configs.recommended],
  },
  {
    files: ["lib/canon/**/*.js"],
    rules: {
      // Vendored graph-truth mirror — async store API is sync today; keep lint light.
      "@typescript-eslint/require-await": "off",
    },
  },
);
