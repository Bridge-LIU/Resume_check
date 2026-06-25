/**
 * Next.js App Router のサーバ側初期化フック。
 * Node.js ランタイムでのみ実行（Edge では fs / process.on 不可）。
 *
 * crashGuard を動的 import するのは、Edge Runtime バンドラが `process.on` を
 * 静的解析して警告を出さないようにするため（instrumentation.ts 自体は Edge 解析
 * 対象になる）。
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // crash-guard は最優先で入れる（後段の import が失敗しても落ちないように）
  try {
    const mod = await import("@/lib/crashGuard");
    mod.installCrashGuards();
  } catch (e) {
    console.error("[instrumentation] crashGuard install failed:", e);
  }

  try {
    const mod = await import("@/lib/retentionScheduler");
    mod.startRetentionScheduler();
  } catch (e) {
    console.error("[instrumentation] retentionScheduler start failed:", e);
  }
}
