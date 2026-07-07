import Link from "next/link";
import {
  getEvaluation,
  listSessions,
  saveSessionMeta,
} from "@/lib/storage";
import {
  STATUS_CARD_BG,
  VERDICT_CARD_BG,
  RESULT_CARD_BG,
} from "@/lib/uiClass";
import { SessionListFilters } from "../_components/SessionListFilters";
import { SessionListTable } from "../_components/SessionListTable";
import { SessionsExportButton } from "../_components/SessionsExportButton";

type SP = Promise<{
  state?: string;
  role?: string;
  result?: string;
  verdict?: string;
  q?: string;
}>;

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { state, role, result, verdict, q } = await searchParams;

  const all = listSessions();
  const filtered = all.filter((s) => {
    if (state && s.status !== state) return false;
    if (role && s.役割 !== role) return false;
    if (result && s.result !== result) return false;
    if (verdict && s.合否 !== verdict) return false;
    if (q && !s.氏名.includes(q)) return false;
    return true;
  });

  // 一覧描画の N+1 解消:
  //   優先: SessionMeta.総合スコア / 合否（saveEvaluation 時にデノーマライズ済）
  //   遅延バックフィル: 旧データでメタにキャッシュが無い「評価済」のみ evaluation.json を読む
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
    if (patched.総合スコア !== meta.総合スコア || patched.合否 !== meta.合否) {
      saveSessionMeta(patched);
    }
    return { meta: patched, score: patched.総合スコア ?? null };
  });

  const roleOptions = Array.from(new Set(all.map((s) => s.役割)));

  // 集計カード用件数（全体基準、フィルタ非依存）
  // 工程 4 + 判定 4（合否 2 + 採否 2）= 8 枚を 1 行に並べる。全カードがクリックで絞込。
  const stageCounts = {
    edit:   all.filter((s) => s.status === "編集中").length,
    qpub:   all.filter((s) => s.status === "質問公開").length,
    itv:    all.filter((s) => s.status === "面談済").length,
    eval:   all.filter((s) => s.status === "評価済").length,
    pass:   all.filter((s) => s.合否 === "合格").length,
    fail:   all.filter((s) => s.合否 === "不合格").length,
    hired:  all.filter((s) => s.result === "採用").length,
    reject: all.filter((s) => s.result === "不採用").length,
  };

  return (
    <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
      {/* ヘッダ + エクスポート */}
      <div className="flex items-center gap-3">
        <h1 className="font-bold text-lg">面談パイプライン</h1>
        <div className="flex-1" />
        <SessionsExportButton />
      </div>

      {/* 集計カード 6 種 */}
      <StageCards counts={stageCounts} />

      {/* 表 */}
      <SessionListFilters
        key={`${state ?? ""}|${role ?? ""}|${result ?? ""}|${verdict ?? ""}|${q ?? ""}`}
        initialState={state}
        initialRole={role}
        initialResult={result}
        initialVerdict={verdict}
        initialQ={q}
        roleOptions={roleOptions}
      />

      {filtered.length === 0 ? (
        <EmptyState hasAny={all.length > 0} />
      ) : (
        <SessionListTable rows={rows} total={all.length} />
      )}
    </div>
  );
}

function StageCards({
  counts,
}: {
  counts: {
    edit: number; qpub: number; itv: number; eval: number;
    pass: number; fail: number; hired: number; reject: number;
  };
}) {
  // 合格/採用（emerald）と 不合格/不採用（rose）を同色に。差はアイコンで表現。
  // Responsive: sm→2、md→4、xl→8。1280px 未満だと 8 枚 1 行は窮屈なので 4 段階に。
  const cards: {
    key: keyof typeof counts;
    label: string;
    bg: string;
    icon: string;
    href: string;
  }[] = [
    { key: "edit",   label: "編集中",   bg: STATUS_CARD_BG.edit,    icon: "✏️", href: "/list?state=%E7%B7%A8%E9%9B%86%E4%B8%AD" },
    { key: "qpub",   label: "質問公開", bg: STATUS_CARD_BG.qpub,    icon: "📤", href: "/list?state=%E8%B3%AA%E5%95%8F%E5%85%AC%E9%96%8B" },
    { key: "itv",    label: "面談済",   bg: STATUS_CARD_BG.itv,     icon: "🎤", href: "/list?state=%E9%9D%A2%E8%AB%87%E6%B8%88" },
    { key: "eval",   label: "評価済",   bg: STATUS_CARD_BG.eval,    icon: "📝", href: "/list?state=%E8%A9%95%E4%BE%A1%E6%B8%88" },
    { key: "pass",   label: "合格",     bg: VERDICT_CARD_BG.pass,   icon: "👍", href: "/list?verdict=%E5%90%88%E6%A0%BC" },
    { key: "fail",   label: "不合格",   bg: VERDICT_CARD_BG.fail,   icon: "👎", href: "/list?verdict=%E4%B8%8D%E5%90%88%E6%A0%BC" },
    { key: "hired",  label: "採用",     bg: RESULT_CARD_BG.hired,   icon: "🎉", href: "/list?result=%E6%8E%A1%E7%94%A8" },
    { key: "reject", label: "不採用",   bg: RESULT_CARD_BG.reject,  icon: "🚫", href: "/list?result=%E4%B8%8D%E6%8E%A1%E7%94%A8" },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-2">
      {cards.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className={`${c.bg} text-white rounded-lg p-3 shadow-sm relative overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition`}
        >
          <div className="text-2xl font-bold tabular leading-tight">{counts[c.key]}</div>
          <div className="text-xs mt-0.5 opacity-90 whitespace-nowrap">{c.label}</div>
          <div className="absolute right-2 bottom-1.5 text-2xl opacity-20 leading-none">
            {c.icon}
          </div>
        </Link>
      ))}
    </div>
  );
}

function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-12 text-center space-y-3">
      <div className="text-muted-foreground opacity-70 text-4xl">📋</div>
      <div className="text-sm text-muted-foreground">
        {hasAny ? "条件に合う面談がありません" : "まだ面談がありません"}
      </div>
      {!hasAny && (
        <Link
          href="/new"
          className="inline-block bg-primary hover:bg-primary/90 text-primary-foreground text-sm px-4 py-1.5 rounded font-medium"
        >
          ＋ 最初の面談を作成
        </Link>
      )}
    </div>
  );
}
