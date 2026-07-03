/**
 * next dev / next start を PORT 環境変数 fallback 付きで起動するラッパー。
 *
 * 使い方（package.json から）:
 *   "dev":   "node scripts/next-with-port.mjs dev"
 *   "start": "node scripts/next-with-port.mjs start"
 *
 * ポート決定順:
 *   1. PORT 環境変数（start-app.bat から `set PORT=xxxx` で渡せる）
 *   2. デフォルト 3939
 *
 * ホスト: 127.0.0.1 に固定（ローカル PC 前提のツールのため、外部からの
 * アクセスを受け付けないよう明示的に loopback にバインドする）
 */
import { spawn } from "node:child_process";

const cmd = process.argv[2];
if (cmd !== "dev" && cmd !== "start") {
  console.error(`Usage: node scripts/next-with-port.mjs <dev|start>`);
  process.exit(1);
}

const port = process.env.PORT || "3939";
const host = "127.0.0.1";

console.log(`[next-with-port] ${cmd} on http://${host}:${port}`);

// Windows / POSIX 両対応で npx 経由で next を起動
const isWin = process.platform === "win32";
const child = spawn(
  isWin ? "npx.cmd" : "npx",
  ["next", cmd, "-H", host, "-p", port],
  { stdio: "inherit", shell: isWin },
);
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
// SIGINT / SIGTERM を子プロセスに転送
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}
