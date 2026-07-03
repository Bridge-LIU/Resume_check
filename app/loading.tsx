/**
 * 面談一覧のスケルトン。
 * listSessions と評価読込（旧データのバックフィル）の間に描画される。
 */
export default function HomeLoading() {
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 space-y-4 animate-pulse">
        <div className="h-6 w-32 bg-zinc-200 rounded" />
        <div className="flex gap-2">
          <div className="h-8 w-40 bg-zinc-100 rounded" />
          <div className="h-8 w-32 bg-zinc-100 rounded" />
          <div className="h-8 w-32 bg-zinc-100 rounded" />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <div className="h-9 bg-zinc-50" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-12 border-t bg-white px-3 flex items-center gap-3">
              <div className="h-4 w-24 bg-zinc-100 rounded" />
              <div className="h-4 w-32 bg-zinc-100 rounded" />
              <div className="h-4 w-16 bg-zinc-100 rounded" />
              <div className="flex-1" />
              <div className="h-4 w-12 bg-zinc-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
