import Link from "next/link";
import { getEvaluation, listSessions } from "@/lib/storage";
import { SessionListFilters } from "./_components/SessionListFilters";
import { SessionListTable } from "./_components/SessionListTable";

type SP = Promise<{ state?: string; role?: string; result?: string; q?: string }>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { state, role, result, q } = await searchParams;

  const all = listSessions();
  const filtered = all.filter((s) => {
    if (state && s.status !== state) return false;
    if (role && s.役割 !== role) return false;
    if (result && s.result !== result) return false;
    if (q && !s.氏名.includes(q)) return false;
    return true;
  });

  // 評価結果から総合スコアを取得
  const rows = filtered.map((meta) => {
    const ev = meta.status === "評価済" ? getEvaluation(meta.id) : null;
    return { meta, score: ev?.総合スコア ?? null };
  });

  const roleOptions = Array.from(new Set(all.map((s) => s.役割)));

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-lg">面談一覧</h2>
          <div className="flex-1" />
        </div>

        <SessionListFilters
          initialState={state}
          initialRole={role}
          initialResult={result}
          initialQ={q}
          roleOptions={roleOptions}
        />

        {filtered.length === 0 ? (
          <EmptyState hasAny={all.length > 0} />
        ) : (
          <SessionListTable rows={rows} total={all.length} />
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="border-2 border-dashed rounded-lg p-12 text-center space-y-3">
      <div className="text-zinc-400 text-4xl">📋</div>
      <div className="text-sm text-zinc-500">
        {hasAny ? "条件に合う面談がありません" : "まだ面談がありません"}
      </div>
      {!hasAny && (
        <Link
          href="/new"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded font-medium"
        >
          ＋ 最初の面談を作成
        </Link>
      )}
    </div>
  );
}
