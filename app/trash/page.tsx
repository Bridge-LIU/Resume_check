import { listTrash } from "@/lib/retention";
import { TrashList } from "./_components/TrashList";

export default async function Page() {
  const items = listTrash();

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">ゴミ箱</h1>
          <span className="text-xs text-muted-foreground">_trash/ 配下のソフト削除一覧</span>
        </div>
        {items.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center space-y-3">
            <div className="text-muted-foreground opacity-70 text-4xl">🗑️</div>
            <div className="text-sm text-muted-foreground">ゴミ箱は空です</div>
          </div>
        ) : (
          <TrashList items={items} />
        )}

        <div className="text-xs text-muted-foreground">
          ※ 復元すると <code className="bg-muted px-1 rounded">sessions/</code> に戻ります。完全削除は元に戻せません。猶予が 0 日になると次回スイープで自動的に完全削除されます。
        </div>
      </div>
    </div>
  );
}
