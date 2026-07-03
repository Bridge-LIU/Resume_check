import Link from "next/link";
import {
  getEvaluation,
  listSessions,
  saveSessionMeta,
} from "@/lib/storage";
import { SessionListFilters } from "./_components/SessionListFilters";
import { SessionListTable } from "./_components/SessionListTable";
import { SessionsExportButton } from "./_components/SessionsExportButton";

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

  // 一覧描画の N+1 解消:
  //   優先: SessionMeta.総合スコア / 合否（saveEvaluation 時にデノーマライズ済）
  //   遅延バックフィル: 旧データでメタにキャッシュが無い「評価済」のみ evaluation.json を読む
  //   （次回以降は meta から直接取れるので 1 回だけ）
  const rows = filtered.map((meta) => {
    const hasScore = typeof meta.総合スコア === "number";
    const hasVerdict = meta.合否 != null;
    if (hasScore && hasVerdict) {
      return { meta, score: meta.総合スコア ?? null };
    }
    if (meta.status !== "評価済") {
      return { meta, score: meta.総合スコア ?? null };
    }
    const ev = getEvaluation(meta.id);
    if (!ev) return { meta, score: meta.総合スコア ?? null };
    const patched: typeof meta = {
      ...meta,
      総合スコア: hasScore ? meta.総合スコア : ev.総合スコア,
      合否: hasVerdict ? meta.合否 : ev.合否,
    };
    // 差分があれば 1 度だけバックフィル
    if (patched.総合スコア !== meta.総合スコア || patched.合否 !== meta.合否) {
      saveSessionMeta(patched);
    }
    return { meta: patched, score: patched.総合スコア ?? null };
  });

  const roleOptions = Array.from(new Set(all.map((s) => s.役割)));

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">面談一覧</h1>
          <div className="flex-1" />
          <SessionsExportButton />
        </div>

        <SessionListFilters
          // URL パラメータ変更時にコンポーネントを再マウントさせ、内部 state を
          // initial* から再初期化する（旧 useEffect+setState 同期パターンの代替）。
          key={`${state ?? ""}|${role ?? ""}|${result ?? ""}|${q ?? ""}`}
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
