import { listTrash } from "@/lib/retention";
import { TrashList } from "./_components/TrashList";
import { PageHeader } from "@/app/_components/PageHeader";

export default async function Page() {
  const items = listTrash();

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <PageHeader
        title="ゴミ箱"
        meta="_trash/ 配下のソフト削除一覧"
        backHref="/settings"
        backLabel="設定"
      />
      <div className="p-6 space-y-4">
        {items.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center space-y-3">
            <div className="text-zinc-400 text-4xl">🗑️</div>
            <div className="text-sm text-zinc-500">ゴミ箱は空です</div>
          </div>
        ) : (
          <TrashList items={items} />
        )}

        <div className="text-xs text-zinc-500">
          ※ 復元すると <code className="bg-zinc-100 px-1 rounded">sessions/</code> に戻ります。完全削除は元に戻せません。猶予が 0 日になると次回スイープで自動的に完全削除されます。
        </div>
      </div>
    </div>
  );
}
