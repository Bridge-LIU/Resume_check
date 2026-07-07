import Link from "next/link";

// 別 UI 案（カンバンボード式）。
// /preview がテーブル中心なのに対し、こちらは状態を「列」として並べ、
// セッションを「カード」として置く。パイプラインの状況が一目で分かる。

type Status = "編集中" | "質問公開" | "面談済" | "評価済";
type RoleTag = "nw" | "sv" | "dev" | "sp" | "pm" | "it";
type Verdict = "合格" | "普通" | "不合格" | null;

type Card = {
  id: string;
  name: string;
  role: string;
  roleTag: RoleTag;
  date: string;
  score: number | null;
  verdict: Verdict;
  updatedAgo: string;
};

const CARDS: Record<Status, Card[]> = {
  編集中: [
    { id: "s5", name: "田中 健太",   role: "PM",         roleTag: "pm",  date: "2026-07-06", score: null, verdict: null, updatedAgo: "1時間前" },
    { id: "s9", name: "小林 剛",     role: "サーバ",     roleTag: "sv",  date: "2026-07-06", score: null, verdict: null, updatedAgo: "2時間前" },
    { id: "s10", name: "加藤 千夏",   role: "開発",       roleTag: "dev", date: "2026-07-05", score: null, verdict: null, updatedAgo: "昨日" },
  ],
  質問公開: [
    { id: "s4", name: "高橋 明日香", role: "サポート",   roleTag: "sp",  date: "2026-07-05", score: null, verdict: null, updatedAgo: "3時間前" },
    { id: "s11", name: "松本 響",    role: "情シス",     roleTag: "it",  date: "2026-07-04", score: null, verdict: null, updatedAgo: "昨日" },
  ],
  面談済: [
    { id: "s2", name: "佐藤 花子",   role: "サーバ",     roleTag: "sv",  date: "2026-07-04", score: null, verdict: null, updatedAgo: "2日前" },
    { id: "s8", name: "中村 美咲",   role: "ネットワーク",roleTag: "nw", date: "2026-07-05", score: null, verdict: null, updatedAgo: "昨日" },
    { id: "s12", name: "藤田 直人",   role: "開発",       roleTag: "dev", date: "2026-07-03", score: null, verdict: null, updatedAgo: "3日前" },
    { id: "s13", name: "山本 亜衣",   role: "PM",         roleTag: "pm",  date: "2026-07-04", score: null, verdict: null, updatedAgo: "2日前" },
  ],
  評価済: [
    { id: "s1", name: "山田 太郎",   role: "ネットワーク",roleTag: "nw", date: "2026-06-30", score: 82.4, verdict: "合格",   updatedAgo: "1週間前" },
    { id: "s3", name: "鈴木 一郎",   role: "開発",       roleTag: "dev", date: "2026-07-02", score: 71.0, verdict: "普通",   updatedAgo: "5日前" },
    { id: "s6", name: "伊藤 詩織",   role: "情シス",     roleTag: "it",  date: "2026-06-28", score: 76.2, verdict: "合格",   updatedAgo: "1週間前" },
    { id: "s7", name: "渡辺 拓也",   role: "開発",       roleTag: "dev", date: "2026-06-25", score: 48.5, verdict: "不合格", updatedAgo: "12日前" },
  ],
};

const COLUMN_ORDER: Status[] = ["編集中", "質問公開", "面談済", "評価済"];

const COLUMN_STYLE: Record<
  Status,
  { accent: string; bg: string; icon: string; text: string }
> = {
  編集中:   { accent: "border-t-zinc-400",   bg: "bg-muted/70",    icon: "✏️", text: "text-muted-foreground"   },
  質問公開: { accent: "border-t-amber-400",  bg: "bg-amber-50/60",   icon: "📤", text: "text-amber-700"  },
  面談済:   { accent: "border-t-violet-400", bg: "bg-violet-50/60",  icon: "🎤", text: "text-violet-700" },
  評価済:   { accent: "border-t-blue-400",   bg: "bg-blue-50/60",    icon: "📝", text: "text-blue-700"   },
};

const totals = Object.fromEntries(
  COLUMN_ORDER.map((s) => [s, CARDS[s].length]),
) as Record<Status, number>;
const totalCount = Object.values(totals).reduce((a, b) => a + b, 0);
const evaluatedCards = CARDS["評価済"];
const passCount = evaluatedCards.filter((c) => c.verdict === "合格").length;
const failCount = evaluatedCards.filter((c) => c.verdict === "不合格").length;
const midCount = evaluatedCards.filter((c) => c.verdict === "普通").length;
const passRate = evaluatedCards.length > 0 ? Math.round((passCount / evaluatedCards.length) * 100) : 0;

export default function Preview2Page() {
  return (
    <div className="space-y-6">
      {/* バナー */}
      <div className="bg-card rounded-2xl border shadow-sm p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="text-2xs px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
            プレビュー2
          </span>
          <span>カンバンボード案（別 UI 候補）</span>
          <div className="flex-1" />
          <Link href="/preview" className="text-muted-foreground hover:text-foreground hover:underline">
            /preview (表案)
          </Link>
          <Link href="/" className="text-primary hover:underline">
            現行 一覧 →
          </Link>
        </div>
      </div>

      {/* ヘッダ */}
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <div className="text-2xs text-muted-foreground uppercase tracking-wider">Pipeline</div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">面談パイプライン</h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            全 {totalCount} 件 ・ 直近 30 日
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <FilterChip label="すべての役割" />
          <FilterChip label="今週" />
          <FilterChip label="橋本 担当" />
          <button className="border rounded-lg px-3 py-1.5 text-sm hover:bg-accent">
            エクスポート
          </button>
        </div>
      </div>

      {/* KPI ミニストリップ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniKpi label="合格率" value={`${passRate}%`} sub={`${passCount} / ${evaluatedCards.length} 件`} tone="emerald" />
        <MiniKpi label="今週の面談" value="5" sub="面談済 + 質問公開" tone="violet" />
        <MiniKpi label="評価待ち" value={String(totals["面談済"])} sub="面談済 → 評価済 へ" tone="amber" />
        <MiniKpi label="不合格" value={String(failCount)} sub={`普通 ${midCount} 件を含めた分析へ`} tone="rose" />
      </div>

      {/* カンバン */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {COLUMN_ORDER.map((s) => (
          <KanbanColumn key={s} status={s} cards={CARDS[s]} count={totals[s]} />
        ))}
      </div>
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <button className="border rounded-full px-3 py-1 text-xs text-muted-foreground hover:bg-accent hover:border-muted-foreground">
      {label}
      <span className="ml-1 text-muted-foreground opacity-70">▾</span>
    </button>
  );
}

function MiniKpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "violet" | "amber" | "rose";
}) {
  const bar = {
    emerald: "bg-emerald-500",
    violet: "bg-violet-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[tone];
  return (
    <div className="bg-card rounded-2xl border shadow-sm p-4 relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} />
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold tabular text-foreground mt-1">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function KanbanColumn({
  status,
  cards,
  count,
}: {
  status: Status;
  cards: Card[];
  count: number;
}) {
  const style = COLUMN_STYLE[status];
  return (
    <div className={`rounded-2xl border border-t-4 ${style.accent} ${style.bg} flex flex-col min-h-[400px]`}>
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <span className={`text-lg leading-none ${style.text}`}>{style.icon}</span>
        <span className={`font-semibold text-sm ${style.text}`}>{status}</span>
        <span className={`text-2xs px-1.5 py-0.5 rounded-full bg-card/70 border ${style.text} tabular`}>
          {count}
        </span>
        <div className="flex-1" />
        <button
          className={`text-lg leading-none ${style.text} hover:opacity-70`}
          aria-label="このカラムに新規追加"
          title="新規追加"
        >
          ＋
        </button>
      </div>
      <div className="px-2 pb-2 space-y-2 flex-1">
        {cards.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground opacity-70 py-8">— なし —</div>
        ) : (
          cards.map((c) => <SessionCard key={c.id} card={c} />)
        )}
      </div>
    </div>
  );
}

function SessionCard({ card }: { card: Card }) {
  const verdictColor =
    card.verdict === "合格"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : card.verdict === "普通"
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : card.verdict === "不合格"
          ? "text-rose-700 bg-rose-50 border-rose-200"
          : null;
  return (
    <div className="bg-card rounded-xl border shadow-sm p-3 hover:shadow-md hover:-translate-y-0.5 transition cursor-pointer">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-foreground truncate">{card.name}</div>
          <div className="text-2xs text-muted-foreground opacity-70 mt-0.5">#{card.id.toUpperCase()}</div>
        </div>
        {card.score != null && (
          <div className="text-right shrink-0">
            <div className="text-lg font-bold tabular text-foreground leading-none">
              {card.score.toFixed(1)}
            </div>
            <div className="text-2xs text-muted-foreground opacity-70 mt-0.5">スコア</div>
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        <span className={`pill pill-role-${card.roleTag} text-2xs`}>{card.role}</span>
        {verdictColor && (
          <span className={`text-2xs px-1.5 py-0.5 rounded-full border ${verdictColor}`}>
            {card.verdict}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 text-2xs text-muted-foreground opacity-70">
        <span>📅 {card.date}</span>
        <span>・</span>
        <span>更新 {card.updatedAgo}</span>
      </div>
    </div>
  );
}
