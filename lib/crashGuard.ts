/**
 * Node.js プロセスを未捕捉エラーで落とさないためのガード。
 *
 * instrumentation.ts から **動的 import 経由でのみ**呼ばれる。
 * 静的 import すると Next.js の Edge Runtime バンドラが `process.on` を検出して
 * 警告を出すため、別ファイルに分離している。
 */

import "server-only";

type GuardedProcess = NodeJS.Process & { _resumeClaudeGuardsInstalled?: boolean };

export function installCrashGuards(): void {
  const g = process as GuardedProcess;
  if (g._resumeClaudeGuardsInstalled) return;
  g._resumeClaudeGuardsInstalled = true;

  process.on("uncaughtException", (err, origin) => {
    console.error(
      `\n[crash-guard] uncaughtException (origin=${origin}):`,
      err?.stack ?? err,
    );
  });

  process.on("unhandledRejection", (reason) => {
    console.error(
      "\n[crash-guard] unhandledRejection:",
      reason instanceof Error ? reason.stack : reason,
    );
  });

  process.on("warning", (w) => {
    console.warn("[crash-guard] node warning:", w.name, "—", w.message);
  });

  console.log(
    "[crash-guard] uncaughtException / unhandledRejection ハンドラを登録しました",
  );
}
