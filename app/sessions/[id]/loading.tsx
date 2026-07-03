/**
 * セッション詳細画面のスケルトン。
 * Server Component が同期 fs で複数 JSON を読む間に描画される。
 */
export default function SessionLoading() {
  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 space-y-6 animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-6 w-32 bg-zinc-200 rounded" />
          <div className="h-5 w-16 bg-zinc-200 rounded-full" />
          <div className="h-5 w-20 bg-zinc-200 rounded-full" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3">
              <div className="h-5 w-40 bg-zinc-200 rounded" />
              <div className="h-3 w-full bg-zinc-100 rounded" />
              <div className="h-3 w-5/6 bg-zinc-100 rounded" />
              <div className="h-3 w-2/3 bg-zinc-100 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
