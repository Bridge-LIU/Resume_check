import Link from "next/link";

/**
 * セッションが存在しない / 不正な ID で getSessionMeta が null を返した場合の受け皿。
 * sessions/[id]/page.tsx で `notFound()` が呼ばれるとここが描画される。
 */
export default function SessionNotFound() {
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="p-8 space-y-4 text-center">
        <div className="text-4xl">🗂️</div>
        <h1 className="text-lg font-bold">面談が見つかりません</h1>
        <p className="text-sm text-muted-foreground">
          指定された面談セッションは存在しないか、削除された可能性があります。
        </p>
        <div className="flex gap-2 justify-center">
          <Link
            href="/list"
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm px-4 py-1.5 rounded font-medium"
          >
            一覧へ戻る
          </Link>
          <Link
            href="/trash"
            className="border hover:bg-accent text-sm px-3 py-1.5 rounded"
          >
            ゴミ箱を見る
          </Link>
        </div>
      </div>
    </div>
  );
}
