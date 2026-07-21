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
    // Build artifacts (pkg + ZIP output, gitignored):
    "test-release/**",
  ]),
  // Ban process.cwd() outside lib/storage.ts. standalone 版は
  // server.js が cwd を .next/standalone/ に変更するため、素の process.cwd() だと
  // プロジェクト直下のリソース（.backup/、運用マニュアル.HTML 等）を解決できない。
  // 代わりに getProjectRoot() を使う（RESUME_CLAUDE_PROJECT_ROOT env → cwd 補正 →
  // 素の cwd の順で正しく解決）。lib/storage.ts は getProjectRoot 自身の実装が
  // process.cwd() を必要とするため唯一例外。
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["lib/storage.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='process'][callee.property.name='cwd']",
          message:
            "process.cwd() は standalone モードで .next/standalone/ を指す。lib/storage の getProjectRoot() を使う。",
        },
      ],
    },
  },
]);

export default eslintConfig;
