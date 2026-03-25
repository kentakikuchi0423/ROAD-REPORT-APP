import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // 未使用変数は _ プレフィックスで許可
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // console.log は warn（本番コードでは使わない）
      "no-console": "warn",
    },
  },
  {
    // テストファイルは型チェック付きルールを緩和
    files: ["tests/**/*.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: ["dist/**", ".wrangler/**", "node_modules/**"],
  },
);
