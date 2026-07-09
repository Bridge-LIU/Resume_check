import Link from "next/link";
import { STATUS_CARD_BG, STATUS_ICON } from "@/lib/uiClass";

// セッション 0 件時のホーム画面 2 案 プレビュー。
// nav には出さない。実装で採用する案を決めるための比較ページ。
// ダミー値は全部 0 / ― にして、Section が並ぶ姿だけ見せる。

export const dynamic = "force-static";

const NOW = new Date();
const fmtMd = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
const startOfWeek = (d: Date) => {
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - diff);
  return r;
};
const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const thisWeekStart = startOfWeek(NOW);
const thisWeekEnd = addDays(thisWeekStart, 7);

export default function PreviewHomeEmpty() {
  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border shadow-sm px-6 py-4 flex items-center gap-3">
        <h1 className="font-bold text-lg">ホーム画面（0 件時）融合案 プレビュー</h1>
        <span className="text-xs text-muted-foreground">
          nav 非表示 ・ 静的モック ・ ダミー値
        </span>
        <div className="flex-1" />
        <Link
          href="/"
          className="text-xs text-primary hover:underline"
        >
          本番の /
        </Link>
      </div>

      <VariantSection tag="現行" title="① 現行：オンボーディングだけ（Bento 隠れる）">
        <CurrentOnboardingOnly />
      </VariantSection>

      <VariantSection tag="A" title="② 案 A：オンボーディング バナー ＋ Bento (0/―)">
        <VariantA />
      </VariantSection>

      <VariantSection tag="B" title="③ 案 B：大タイルを オンボーディング CTA に置換">
        <VariantB />
      </VariantSection>
    </div>
  );
}

/* ─────────────────────────────── 案枠 ─────────────────────────────── */

function VariantSection({
  tag,
  title,
  children,
}: {
  tag: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-xs font-mono bg-primary/10 text-primary rounded-full px-2 py-0.5">
          {tag}
        </span>
        <h2 className="font-bold text-sm">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <h1 className="font-bold text-lg">ホーム</h1>
      <div className="text-sm text-muted-foreground tabular">
        {NOW.getFullYear()}/{NOW.getMonth() + 1}/{NOW.getDate()}
      </div>
    </div>
  );
}

/* ─────────────────────────────── 現行 ─────────────────────────────── */

function CurrentOnboardingOnly() {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
      <Header />
      <div className="rounded-lg border-2 border-dashed border-emerald-300 bg-emerald-50/50 dark:bg-emerald-500/10 p-8 text-center space-y-4">
        <div className="text-5xl">📋</div>
        <div>
          <div className="font-bold text-lg text-emerald-900 dark:text-emerald-200">
            マスタの準備 OK！
          </div>
          <div className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
            求人情報と評価条件が揃いました。最初の面談を作ってみましょう。
          </div>
        </div>
        <Link
          href="/new"
          className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-5 py-2 rounded font-medium shadow-sm"
        >
          ＋ 最初の面談を作成
        </Link>
        <div className="text-xs text-emerald-700/70 dark:text-emerald-400/70">
          役割は 5 件登録済み ・ 変更は{" "}
          <Link href="/master" className="underline">
            /master
          </Link>{" "}
          から
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── 案 A ─────────────────────────────── */

function VariantA() {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
      <Header />

      {/* オンボーディング バナー（横一列、コンパクト） */}
      <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-500/10 dark:to-blue-500/10 dark:border-emerald-500/40 p-4 flex items-center gap-4">
        <div className="text-4xl leading-none shrink-0">📋</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-emerald-900 dark:text-emerald-200">
            マスタの準備 OK！最初の面談を作ってみましょう
          </div>
          <div className="text-xs text-emerald-800/80 dark:text-emerald-300/80 mt-0.5">
            役割 5 件・評価条件 6 小軸 登録済み ・ 変更は{" "}
            <Link href="/master" className="underline">
              /master
            </Link>{" "}
            から
          </div>
        </div>
        <Link
          href="/new"
          className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded font-medium shadow-sm shrink-0"
        >
          ＋ 最初の面談を作成
        </Link>
      </div>

      {/* Bento グリッド（全部 0 / ―） */}
      <div className="grid grid-cols-6 gap-3 auto-rows-[110px]">
        <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border bg-gradient-to-br from-blue-500 to-violet-600 text-white p-5 shadow-sm relative overflow-hidden">
          <div className="text-xs opacity-80 uppercase tracking-widest">
            今週の面談
          </div>
          <div className="text-6xl font-bold tabular mt-1">0</div>
          <div className="text-sm mt-1 opacity-90">先週比 0</div>
          <div className="absolute right-4 bottom-4 text-6xl opacity-15">📅</div>
          <div className="absolute right-4 top-4 text-2xs bg-card/20 rounded-full px-2 py-0.5 tabular">
            {fmtMd(thisWeekStart)} – {fmtMd(addDays(thisWeekEnd, -1))}
          </div>
        </div>

        <MutedCard label="合格率" main="―" sub="評価済ゼロ" />
        <MutedCard label="平均スコア" main="―" sub="先週データなし" />

        <div className="col-span-6 md:col-span-2 row-span-2 rounded-xl border bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4 shadow-sm">
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            評価待ち
          </div>
          <div className="text-4xl font-bold text-amber-700 dark:text-amber-300 tabular mt-1">
            0
          </div>
          <div className="text-2xs text-amber-600 dark:text-amber-400 mt-0.5">
            面談済 → 評価済
          </div>
          <div className="mt-3 text-2xs text-muted-foreground">なし</div>
        </div>

        <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center mb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">
              最近の活動
            </div>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground opacity-70">なし</span>
          </div>
          <div className="py-6 text-center text-sm text-muted-foreground">
            まだ面談がありません
          </div>
        </div>
      </div>

      {/* 状態別カウント */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ZeroStageCard label="編集中" bg={STATUS_CARD_BG.edit} icon={STATUS_ICON["編集中"]} />
        <ZeroStageCard label="質問公開" bg={STATUS_CARD_BG.qpub} icon={STATUS_ICON["質問公開"]} />
        <ZeroStageCard label="面談済" bg={STATUS_CARD_BG.itv} icon={STATUS_ICON["面談済"]} />
        <ZeroStageCard label="評価済" bg={STATUS_CARD_BG.eval} icon={STATUS_ICON["評価済"]} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── 案 B ─────────────────────────────── */

function VariantB() {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
      <Header />

      <div className="grid grid-cols-6 gap-3 auto-rows-[110px]">
        {/* 大タイル置換: オンボーディング CTA */}
        <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border-2 border-dashed border-emerald-300 bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-500/15 dark:to-blue-500/15 dark:border-emerald-500/50 p-5 shadow-sm relative overflow-hidden flex flex-col justify-center items-start">
          <div className="text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-widest font-medium">
            はじめての面談
          </div>
          <div className="font-bold text-xl text-emerald-900 dark:text-emerald-200 mt-1">
            マスタの準備 OK！
          </div>
          <div className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
            求人情報・評価条件は揃いました。最初の面談を作ってみましょう。
          </div>
          <Link
            href="/new"
            className="mt-3 inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded font-medium shadow-sm"
          >
            ＋ 最初の面談を作成 →
          </Link>
          <div className="absolute right-4 bottom-4 text-6xl opacity-15">📋</div>
        </div>

        <MutedCard label="合格率" main="―" sub="評価済ゼロ" />
        <MutedCard label="平均スコア" main="―" sub="先週データなし" />

        <div className="col-span-6 md:col-span-2 row-span-2 rounded-xl border bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4 shadow-sm">
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            評価待ち
          </div>
          <div className="text-4xl font-bold text-amber-700 dark:text-amber-300 tabular mt-1">
            0
          </div>
          <div className="text-2xs text-amber-600 dark:text-amber-400 mt-0.5">
            面談済 → 評価済
          </div>
          <div className="mt-3 text-2xs text-muted-foreground">なし</div>
        </div>

        {/* 最近の活動 → 「次にやること」ガイドに置換 */}
        <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
            次にやること
          </div>
          <ol className="space-y-2 text-sm">
            <NextStep num="1" label="求人情報を確認" href="/master" active />
            <NextStep num="2" label="＋ 面談を作成" href="/new" />
            <NextStep num="3" label="面談者情報 / 求める人材条件 を入力" />
            <NextStep num="4" label="質問リストを AI に生成させる / 貼付する" />
            <NextStep num="5" label="面談内容を貼付 → 評価結果を確認" />
          </ol>
        </div>
      </div>

      {/* 状態別カウント */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ZeroStageCard label="編集中" bg={STATUS_CARD_BG.edit} icon={STATUS_ICON["編集中"]} />
        <ZeroStageCard label="質問公開" bg={STATUS_CARD_BG.qpub} icon={STATUS_ICON["質問公開"]} />
        <ZeroStageCard label="面談済" bg={STATUS_CARD_BG.itv} icon={STATUS_ICON["面談済"]} />
        <ZeroStageCard label="評価済" bg={STATUS_CARD_BG.eval} icon={STATUS_ICON["評価済"]} />
      </div>
    </div>
  );
}

/* ─────────────────────────────── 部品 ─────────────────────────────── */

function MutedCard({ label, main, sub }: { label: string; main: string; sub: string }) {
  return (
    <div className="col-span-3 md:col-span-2 rounded-xl border bg-card p-4 shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold tabular mt-1 text-muted-foreground opacity-70">
        {main}
      </div>
      <div className="text-2xs text-muted-foreground opacity-70 mt-0.5">{sub}</div>
    </div>
  );
}

function ZeroStageCard({
  label,
  bg,
  icon,
}: {
  label: string;
  bg: string;
  icon: string;
}) {
  return (
    <div
      className={`${bg} text-white rounded-xl p-4 shadow-sm relative overflow-hidden opacity-60`}
    >
      <div className="text-3xl font-bold tabular">0</div>
      <div className="text-sm mt-1 opacity-90">{label}</div>
      <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">
        {icon}
      </div>
    </div>
  );
}

function NextStep({
  num,
  label,
  href,
  active,
}: {
  num: string;
  label: string;
  href?: string;
  active?: boolean;
}) {
  const inner = (
    <li
      className={
        "flex items-center gap-3 rounded-lg px-2 py-1.5 " +
        (active
          ? "bg-emerald-50 dark:bg-emerald-500/10"
          : "hover:bg-muted/60")
      }
    >
      <span
        className={
          "w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 " +
          (active
            ? "bg-emerald-600 text-white"
            : "bg-muted text-muted-foreground")
        }
      >
        {num}
      </span>
      <span className={active ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      {href && (
        <>
          <div className="flex-1" />
          <span className="text-xs text-primary">→</span>
        </>
      )}
    </li>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
