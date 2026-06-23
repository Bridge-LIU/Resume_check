/**
 * Next.js App Router のサーバ側初期化フック。
 * Node.js ランタイムでのみ retentionScheduler を起動する（Edge では fs 不可）。
 */

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startRetentionScheduler } = await import("@/lib/retentionScheduler");
  startRetentionScheduler();
}
