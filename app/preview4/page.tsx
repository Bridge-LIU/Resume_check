import Link from "next/link";

// パイプラインエリアの改善 4 案（静的モック）。
// /?（面談一覧）ページ上部の 6 カード帯を置き換える候補を横並びで比較する用。
// カウントは全案で同じ値を使う（比較しやすさ優先）。

const COUNTS = {
  edit: 12,
  qpub: 8,
  itv: 5,
  eval: 4,
  pass: 3,
  mid: 1,
  fail: 0,
};
const TOTAL = COUNTS.edit + COUNTS.qpub + COUNTS.itv + COUNTS.eval;
const PASS_RATE = Math.round(
  (COUNTS.pass / (COUNTS.pass + COUNTS.mid + COUNTS.fail)) * 100,
);

export default function Preview4Page() {
  return (
    <div className="space-y-8">
      <div className="bg-card rounded-xl border shadow-sm p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
            プレビュー4
          </span>
          <span className="text-sm text-muted-foreground">
            「面談パイプライン」エリアの改善案 4 種を比較（静的モック / カウントは同一）
          </span>
          <div className="flex-1" />
          <Link href="/" className="text-primary hover:underline text-sm">
            現行の一覧に戻る →
          </Link>
        </div>
      </div>

      <Section title="現行" desc="今の実装。工程 4 + 結果 2 が同じ大きさで並ぶ（比較用）">
        <Current />
      </Section>

      <Section
        title="案 A ─ ファネル（矢印付き 4 工程）+ 評価済内訳"
        desc="工程の流れを矢印で示し、結果（合格/普通/不合格）は評価済の下に格下げ"
      >
        <OptionA />
      </Section>

      <Section
        title="案 B ─ 現行踏襲 + 評価済カードに合否を内包"
        desc="4 工程カードのままで、合格/不合格の独立カードを廃止し評価済に mini bar で埋め込む"
      >
        <OptionB />
      </Section>

      <Section
        title="案 C ─ ボトルネック警告 + 30 日スパークライン"
        desc="面談済が滞留していれば ⚠ 表示。各カードに 30 日推移を小さく描く（要 作成日時ベース集計）"
      >
        <OptionC />
      </Section>

      <Section
        title="案 D ─ コンパクト水平プログレスバー"
        desc="1 本のバーで工程割合を表示。省スペースだが個別数値は分かりにくい"
      >
        <OptionD />
      </Section>
    </div>
  );
}

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-bold text-base text-foreground">{title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
      <div className="bg-muted rounded-xl border p-4">{children}</div>
    </section>
  );
}

/* ═════════════════════════ 現行 ═════════════════════════ */

function Current() {
  const cards = [
    { key: "edit", label: "編集中",   count: COUNTS.edit, bg: "bg-zinc-500",    icon: "✏️" },
    { key: "qpub", label: "質問公開", count: COUNTS.qpub, bg: "bg-amber-400",   icon: "📤" },
    { key: "itv",  label: "面談済",   count: COUNTS.itv,  bg: "bg-violet-500",  icon: "🎤" },
    { key: "eval", label: "評価済",   count: COUNTS.eval, bg: "bg-blue-500",    icon: "📝" },
    { key: "pass", label: "合格",     count: COUNTS.pass, bg: "bg-emerald-500", icon: "👍" },
    { key: "fail", label: "不合格",   count: COUNTS.fail, bg: "bg-rose-500",    icon: "👎" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-bold text-lg">面談パイプライン</h1>
        <div className="flex-1" />
        <button className="border rounded px-3 py-1 text-sm bg-card hover:bg-accent">エクスポート</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div
            key={c.key}
            className={`${c.bg} text-white rounded-xl p-4 shadow-sm relative overflow-hidden`}
          >
            <div className="text-3xl font-bold tabular">{c.count}</div>
            <div className="text-sm mt-1 opacity-90">{c.label}</div>
            <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">{c.icon}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═════════════════════════ 案 A ─ ファネル ═════════════════════════ */

function OptionA() {
  const stages = [
    { key: "edit", label: "編集中",   count: COUNTS.edit, bg: "bg-zinc-500",   icon: "✏️" },
    { key: "qpub", label: "質問公開", count: COUNTS.qpub, bg: "bg-amber-400",  icon: "📤" },
    { key: "itv",  label: "面談済",   count: COUNTS.itv,  bg: "bg-violet-500", icon: "🎤" },
    { key: "eval", label: "評価済",   count: COUNTS.eval, bg: "bg-blue-500",   icon: "📝" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-bold text-lg">面談パイプライン</h1>
        <span className="text-xs text-muted-foreground">全 {TOTAL} 件 ・ 今週 +3</span>
        <div className="flex-1" />
        <button className="border rounded px-3 py-1 text-sm bg-card hover:bg-accent">エクスポート</button>
      </div>

      <div className="flex items-stretch gap-2 flex-wrap">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-stretch gap-2 flex-1 min-w-[160px]">
            <div className={`${s.bg} text-white rounded-xl p-4 shadow-sm relative overflow-hidden flex-1`}>
              <div className="text-3xl font-bold tabular">{s.count}</div>
              <div className="text-sm mt-1 opacity-90">{s.label}</div>
              <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">{s.icon}</div>
            </div>
            {i < stages.length - 1 && (
              <div className="flex items-center text-muted-foreground opacity-50 text-3xl select-none">→</div>
            )}
          </div>
        ))}
      </div>

      {/* 評価済 内訳 */}
      <div className="flex items-center gap-3 pl-2">
        <div className="text-xs text-muted-foreground">評価済 {COUNTS.eval} 件の内訳:</div>
        <span className="pill pill-pass">合格 {COUNTS.pass}</span>
        <span className="pill pill-mid">普通 {COUNTS.mid}</span>
        <span className="pill pill-fail">不合格 {COUNTS.fail}</span>
        <span className="text-xs text-emerald-700 font-medium tabular ml-2">合格率 {PASS_RATE}%</span>
      </div>
    </div>
  );
}

/* ═════════════════════════ 案 B ─ 現行踏襲 + 内包 ═════════════════════════ */

function OptionB() {
  const total = COUNTS.pass + COUNTS.mid + COUNTS.fail || 1;
  const cards = [
    { key: "edit", label: "編集中",   count: COUNTS.edit, bg: "bg-zinc-500",   icon: "✏️" },
    { key: "qpub", label: "質問公開", count: COUNTS.qpub, bg: "bg-amber-400",  icon: "📤" },
    { key: "itv",  label: "面談済",   count: COUNTS.itv,  bg: "bg-violet-500", icon: "🎤" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-bold text-lg">面談パイプライン</h1>
        <span className="text-xs text-muted-foreground">全 {TOTAL} 件</span>
        <div className="flex-1" />
        <button className="border rounded px-3 py-1 text-sm bg-card hover:bg-accent">エクスポート</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div key={c.key} className={`${c.bg} text-white rounded-xl p-4 shadow-sm relative overflow-hidden`}>
            <div className="text-3xl font-bold tabular">{c.count}</div>
            <div className="text-sm mt-1 opacity-90">{c.label}</div>
            <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">{c.icon}</div>
          </div>
        ))}
        {/* 評価済カード（内包） */}
        <div className="bg-blue-500 text-white rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="text-3xl font-bold tabular">{COUNTS.eval}</div>
          <div className="text-sm mt-1 opacity-90">評価済</div>
          <div className="mt-3 h-1.5 rounded-full bg-card/20 overflow-hidden flex">
            <div className="bg-emerald-300" style={{ width: `${(COUNTS.pass / total) * 100}%` }} />
            <div className="bg-amber-300" style={{ width: `${(COUNTS.mid / total) * 100}%` }} />
            <div className="bg-rose-300" style={{ width: `${(COUNTS.fail / total) * 100}%` }} />
          </div>
          <div className="mt-2 flex items-center gap-2 text-2xs opacity-90 tabular">
            <span>◉ 合格 {COUNTS.pass}</span>
            <span>◉ 普通 {COUNTS.mid}</span>
            <span>◉ 不合格 {COUNTS.fail}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════ 案 C ─ 警告 + スパークライン ═════════════════════════ */

function OptionC() {
  const stages: {
    key: string;
    label: string;
    count: number;
    bg: string;
    icon: string;
    spark: number[];
    warn?: string;
  }[] = [
    { key: "edit", label: "編集中",   count: COUNTS.edit, bg: "bg-zinc-500",   icon: "✏️", spark: [3, 5, 4, 7, 6, 8, 9, 10, 11, 12] },
    { key: "qpub", label: "質問公開", count: COUNTS.qpub, bg: "bg-amber-400",  icon: "📤", spark: [2, 3, 4, 3, 5, 6, 7, 6, 7, 8] },
    { key: "itv",  label: "面談済",   count: COUNTS.itv,  bg: "bg-violet-500", icon: "🎤", spark: [1, 2, 3, 4, 4, 5, 5, 5, 5, 5], warn: "3 日以上滞留" },
    { key: "eval", label: "評価済",   count: COUNTS.eval, bg: "bg-blue-500",   icon: "📝", spark: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4] },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="font-bold text-lg">面談パイプライン</h1>
        <span className="text-xs text-muted-foreground">全 {TOTAL} 件</span>
        {COUNTS.itv >= 3 && (
          <span className="text-2xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-medium">
            ⚠ 評価待ち {COUNTS.itv} 件が滞留
          </span>
        )}
        <div className="flex-1" />
        <button className="border rounded px-3 py-1 text-sm bg-card hover:bg-accent">エクスポート</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stages.map((s) => (
          <div
            key={s.key}
            className={`${s.bg} text-white rounded-xl p-4 shadow-sm relative overflow-hidden`}
          >
            <div className="flex items-baseline gap-2">
              <div className="text-3xl font-bold tabular">{s.count}</div>
              {s.warn && (
                <span className="text-2xs px-1.5 py-0.5 rounded-full bg-card/25 font-medium">
                  ⚠
                </span>
              )}
            </div>
            <div className="text-sm mt-1 opacity-90">{s.label}</div>
            <div className="mt-2">
              <Sparkline values={s.spark} />
            </div>
            <div className="absolute right-3 top-3 text-2xl opacity-15 leading-none">{s.icon}</div>
            {s.warn && (
              <div className="mt-1 text-2xs opacity-90">{s.warn}</div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 pl-2">
        <div className="text-xs text-muted-foreground">評価済 {COUNTS.eval} 件:</div>
        <span className="pill pill-pass">合格 {COUNTS.pass}</span>
        <span className="pill pill-mid">普通 {COUNTS.mid}</span>
        <span className="pill pill-fail">不合格 {COUNTS.fail}</span>
        <span className="text-xs text-emerald-700 font-medium tabular ml-2">合格率 {PASS_RATE}%</span>
      </div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 100;
  const h = 24;
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="block w-full h-6">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={pts}
        className="text-white opacity-70"
      />
    </svg>
  );
}

/* ═════════════════════════ 案 D ─ 水平プログレスバー ═════════════════════════ */

function OptionD() {
  const stages = [
    { key: "edit", label: "編集中",   count: COUNTS.edit, bg: "bg-zinc-500",   text: "text-foreground" },
    { key: "qpub", label: "質問公開", count: COUNTS.qpub, bg: "bg-amber-400",  text: "text-amber-800" },
    { key: "itv",  label: "面談済",   count: COUNTS.itv,  bg: "bg-violet-500", text: "text-violet-800" },
    { key: "eval", label: "評価済",   count: COUNTS.eval, bg: "bg-blue-500",   text: "text-blue-800" },
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-bold text-lg">面談パイプライン</h1>
        <span className="text-xs text-muted-foreground">全 {TOTAL} 件</span>
        <div className="flex-1" />
        <button className="border rounded px-3 py-1 text-sm bg-card hover:bg-accent">エクスポート</button>
      </div>
      {/* Bar */}
      <div className="bg-card rounded-xl border shadow-sm p-4 space-y-3">
        <div className="flex h-10 rounded-lg overflow-hidden">
          {stages.map((s) => (
            <div
              key={s.key}
              className={`${s.bg} text-white flex items-center justify-center text-xs font-medium relative group cursor-pointer hover:brightness-110 transition`}
              style={{ width: `${(s.count / TOTAL) * 100}%` }}
              title={`${s.label} ${s.count} 件`}
            >
              <span className="tabular">{s.count}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {stages.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className={`inline-block w-2 h-2 rounded-sm ${s.bg}`} />
              <span className={s.text}>
                {s.label}{" "}
                <span className="tabular font-medium">{s.count}</span>
              </span>
            </div>
          ))}
          <div className="flex-1" />
          <span className="text-muted-foreground">
            評価済 {COUNTS.eval}: 合格 {COUNTS.pass} / 普通 {COUNTS.mid} / 不合格 {COUNTS.fail}（合格率 {PASS_RATE}%）
          </span>
        </div>
      </div>
    </div>
  );
}
