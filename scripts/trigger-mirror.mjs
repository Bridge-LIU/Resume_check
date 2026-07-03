/**
 * excelMirror を CLI から手動実行してエラーを表面化する。
 * fire-and-forget だと console.warn で消えるので、ここでは throw する。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, ".."));

// Next.js の TS path alias は使えないので、コンパイル後の lib に乗らない。
// 代わりに tsx 経由で直接 .ts を読みたいが、ここはシンプルに JS 移植する。
// → 戦略変更: 実行コードは lib/excelMirror.ts を直接 import する必要があるため、
//   このスクリプトは Next.js の TypeScript ローダーが必要。
// 代わりに動的 import を試みる。

try {
  const { writeMasterMirror, writeSessionsMirror } = await import(
    "../lib/excelMirror.ts"
  );
  console.log("⏳ writeMasterMirror...");
  await writeMasterMirror();
  console.log("✅ master.xlsx 生成成功");
  console.log("⏳ writeSessionsMirror...");
  await writeSessionsMirror();
  console.log("✅ sessions.xlsx 生成成功");
} catch (e) {
  console.error("❌ エラー:");
  console.error(e);
  process.exit(1);
}
