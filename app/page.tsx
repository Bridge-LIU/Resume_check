import Link from "next/link";
import { listSessions, listRoles, getEvalCriteria } from "@/lib/storage";
import type { SessionMeta } from "@/lib/types";
import { STATUS_CARD_BG, STATUS_DOT, STATUS_ICON } from "@/lib/uiClass";
import { seedSampleMasterAction } from "./master/actions";

// 常にリクエスト時に再計算する（fs から listSessions を読むためビルド固化を避ける）
export const dynamic = "force-dynamic";

function startOfWeek(d: Date): Date {
  // 月曜始まり
  const day = d.getDay(); // 0=Sun ... 6=Sat
  const diff = (day + 6) % 7;
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - diff);
  return r;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function fmtMd(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function inRange(iso: string, start: Date, endExclusive: Date): boolean {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < endExclusive.getTime();
}
function relativeTime(iso: string, now: Date): string {
  const t = new Date(iso).getTime();
  const diff = now.getTime() - t;
  const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  if (diff < MIN) return "たった今";
  if (diff < HOUR) return `${Math.floor(diff / MIN)}分前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}時間前`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return "昨日";
  if (days < 7) return `${days}日前`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}週間前`;
  return iso.slice(0, 10);
}

export default async function HomePage() {
  const all = listSessions();
  const roles = listRoles();
  const evalCriteria = getEvalCriteria();
  const masterReady =
    roles.length > 0 &&
    !!evalCriteria &&
    evalCriteria.人間性.小軸.length + evalCriteria.技術力.小軸.length > 0;

  const now = new Date();
  const thisWeekStart = startOfWeek(now);
  const thisWeekEnd = addDays(thisWeekStart, 7);
  const lastWeekStart = addDays(thisWeekStart, -7);

  const thisWeek = all.filter((s) => inRange(s.作成日時, thisWeekStart, thisWeekEnd));
  const lastWeek = all.filter((s) => inRange(s.作成日時, lastWeekStart, thisWeekStart));
  const weekDelta = thisWeek.length - lastWeek.length;

  const stageCounts = {
    edit: all.filter((s) => s.status === "編集中").length,
    qpub: all.filter((s) => s.status === "質問公開").length,
    itv:  all.filter((s) => s.status === "面談済").length,
    eval: all.filter((s) => s.status === "評価済").length,
  };

  const evaluated = all.filter((s) => s.status === "評価済");
  const passCount = evaluated.filter((s) => s.合否 === "合格").length;
  const passRate =
    evaluated.length > 0 ? Math.round((passCount / evaluated.length) * 100) : null;

  const scores = evaluated
    .map((s) => s.総合スコア)
    .filter((v): v is number => typeof v === "number");
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  const twScores = evaluated
    .filter((s) => inRange(s.作成日時, thisWeekStart, thisWeekEnd))
    .map((s) => s.総合スコア)
    .filter((v): v is number => typeof v === "number");
  const lwScores = evaluated
    .filter((s) => inRange(s.作成日時, lastWeekStart, thisWeekStart))
    .map((s) => s.総合スコア)
    .filter((v): v is number => typeof v === "number");
  const twAvg = twScores.length > 0 ? twScores.reduce((a, b) => a + b, 0) / twScores.length : null;
  const lwAvg = lwScores.length > 0 ? lwScores.reduce((a, b) => a + b, 0) / lwScores.length : null;
  const scoreDelta = twAvg != null && lwAvg != null ? twAvg - lwAvg : null;

  const waitingEval = all.filter((s) => s.status === "面談済");
  const recent = all.slice(0, 5);

  // オンボーディング: 状態別に「次にやること」を明示する
  if (!masterReady) {
    return (
      <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
        <Header now={now} />
        <div className="rounded-lg border-2 border-dashed border-blue-300 bg-blue-50/50 p-8 text-center space-y-4">
          <div className="text-5xl">👋</div>
          <div>
            <div className="font-bold text-lg text-blue-900">はじめまして！</div>
            <div className="text-sm text-blue-800 mt-1">
              最初に「求人情報」と「評価条件」を設定します。<br />
              サンプルデータをワンクリックで投入するのがおすすめです。
            </div>
          </div>
          <form action={seedSampleMasterAction} className="flex items-center justify-center gap-3 flex-wrap">
            <button
              type="submit"
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2 rounded font-medium shadow-sm"
            >
              🚀 サンプルマスタを 1 クリック投入
            </button>
            <Link
              href="/master"
              className="text-sm text-blue-700 hover:underline"
            >
              自分で作る →
            </Link>
          </form>
          <div className="text-xs text-blue-700/70">
            投入されるもの: 5 役割（NW / Server / Dev / PMO / ITSupport） + 評価条件（5 軸）
          </div>
        </div>
      </div>
    );
  }

  if (all.length === 0) {
    // 0 件時: 通常ダッシュボードの骨格を保ち、大タイルを CTA・活動タイルを 5 ステップガイドに置換。
    // ミュートで並んだ 状態カウント / 合格率 / 評価待ち / 平均スコア で「面談を作るとここに数値が入る」を予感させる。
    return (
      <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
        <Header now={now} />

        <div className="grid grid-cols-6 gap-3 auto-rows-[110px]">
          {/* 大タイル位置: オンボーディング CTA */}
          <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border-2 border-dashed border-emerald-300 bg-gradient-to-br from-emerald-50 to-blue-50 dark:from-emerald-500/15 dark:to-blue-500/15 dark:border-emerald-500/50 p-5 shadow-sm relative overflow-hidden flex flex-col justify-center items-start">
            <div className="text-xs text-emerald-700 dark:text-emerald-300 uppercase tracking-widest font-medium">
              はじめての面談
            </div>
            <div className="font-bold text-xl text-emerald-900 dark:text-emerald-200 mt-1">
              マスタの準備 OK！
            </div>
            <div className="text-sm text-emerald-800 dark:text-emerald-300 mt-1">
              役割 {roles.length} 件・評価条件登録済み。最初の面談を作ってみましょう。
            </div>
            <Link
              href="/new"
              className="mt-3 inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-4 py-2 rounded font-medium shadow-sm"
            >
              ＋ 最初の面談を作成 →
            </Link>
            <div className="absolute right-4 bottom-4 text-6xl opacity-15">📋</div>
          </div>

          {/* 合格率（ミュート） */}
          <MutedKpiCard label="合格率" main="―" sub="評価済ゼロ" />

          {/* 平均スコア（ミュート） */}
          <MutedKpiCard label="平均スコア" main="―" sub="先週データなし" />

          {/* 評価待ち（0） */}
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

          {/* 活動タイル位置: 次にやること 5 ステップ */}
          <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border bg-card p-4 shadow-sm">
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
              次にやること
            </div>
            <ol className="space-y-1.5 text-sm">
              <NextStep num="1" label="求人情報を確認" href="/master" />
              <NextStep num="2" label="＋ 面談を作成" href="/new" active />
              <NextStep num="3" label="面談者情報 / 求める人材条件 を入力" />
              <NextStep num="4" label="質問リストを AI に生成させる / 貼付する" />
              <NextStep num="5" label="面談内容を貼付 → 評価結果を確認" />
            </ol>
          </div>
        </div>

        {/* 状態別カウント（4 種、ミュート表示） */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ZeroStageCard label="編集中"   bg={STATUS_CARD_BG.edit} icon={STATUS_ICON["編集中"]} />
          <ZeroStageCard label="質問公開" bg={STATUS_CARD_BG.qpub} icon={STATUS_ICON["質問公開"]} />
          <ZeroStageCard label="面談済"   bg={STATUS_CARD_BG.itv}  icon={STATUS_ICON["面談済"]} />
          <ZeroStageCard label="評価済"   bg={STATUS_CARD_BG.eval} icon={STATUS_ICON["評価済"]} />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
      <Header now={now} />

      {/* Bento グリッド */}
      <div className="grid grid-cols-6 gap-3 auto-rows-[110px]">
        {/* 大タイル: 今週の面談 */}
        <Link
          href="/list"
          className="col-span-6 md:col-span-4 row-span-2 rounded-xl border bg-gradient-to-br from-blue-500 to-violet-600 text-white p-5 shadow-sm relative overflow-hidden hover:shadow-md transition"
        >
          <div className="text-xs opacity-80 uppercase tracking-widest">今週の面談</div>
          <div className="text-6xl font-bold tabular mt-1">{thisWeek.length}</div>
          <div className="text-sm mt-1 opacity-90">
            先週比{" "}
            <span className="font-bold">{weekDelta >= 0 ? `+${weekDelta}` : weekDelta}</span>
          </div>
          <div className="absolute right-4 bottom-4 text-6xl opacity-15">📅</div>
          <div className="absolute right-4 top-4 text-2xs bg-card/20 rounded-full px-2 py-0.5 tabular">
            {fmtMd(thisWeekStart)} – {fmtMd(addDays(thisWeekEnd, -1))}
          </div>
        </Link>

        {/* 合格率 */}
        <div className="col-span-3 md:col-span-2 rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">合格率</div>
          <div
            className={
              "text-3xl font-bold tabular mt-1 " +
              (passRate == null ? "text-muted-foreground opacity-70" : "text-emerald-600")
            }
          >
            {passRate == null ? "―" : `${passRate}%`}
          </div>
          <div className="text-2xs text-muted-foreground opacity-70 mt-0.5">
            {evaluated.length > 0 ? `${passCount} / ${evaluated.length} 件` : "評価済ゼロ"}
          </div>
        </div>

        {/* 平均スコア */}
        <div className="col-span-3 md:col-span-2 rounded-xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">平均スコア</div>
          <div
            className={
              "text-3xl font-bold tabular mt-1 " +
              (avgScore == null ? "text-muted-foreground opacity-70" : "text-foreground")
            }
          >
            {avgScore == null ? "―" : avgScore.toFixed(1)}
          </div>
          <div className="text-2xs mt-0.5">
            {scoreDelta == null ? (
              <span className="text-muted-foreground opacity-70">先週データなし</span>
            ) : scoreDelta > 0 ? (
              <span className="text-emerald-600">▲ {scoreDelta.toFixed(1)} pt</span>
            ) : scoreDelta < 0 ? (
              <span className="text-rose-600">▼ {Math.abs(scoreDelta).toFixed(1)} pt</span>
            ) : (
              <span className="text-muted-foreground">先週と同じ</span>
            )}
          </div>
        </div>

        {/* 評価待ち */}
        <Link
          href="/list?state=%E9%9D%A2%E8%AB%87%E6%B8%88"
          className="col-span-6 md:col-span-2 row-span-2 rounded-xl border bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30 p-4 shadow-sm hover:shadow-md transition block"
        >
          <div className="text-xs text-amber-700 dark:text-amber-300 font-medium">評価待ち</div>
          <div className="text-4xl font-bold text-amber-700 dark:text-amber-300 tabular mt-1">{stageCounts.itv}</div>
          <div className="text-2xs text-amber-600 dark:text-amber-400 mt-0.5">面談済 → 評価済</div>
          {waitingEval.length > 0 ? (
            <ul className="mt-3 space-y-1 text-2xs text-foreground/85">
              {waitingEval.slice(0, 4).map((s) => (
                <li key={s.id} className="truncate">
                  ・{s.氏名}（{s.役割}）
                </li>
              ))}
              {waitingEval.length > 4 && (
                <li className="text-muted-foreground opacity-70">... 他 {waitingEval.length - 4} 件</li>
              )}
            </ul>
          ) : (
            <div className="mt-3 text-2xs text-muted-foreground">なし</div>
          )}
        </Link>

        {/* 最近の活動 */}
        <div className="col-span-6 md:col-span-4 row-span-2 rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex items-center mb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">最近の活動</div>
            <div className="flex-1" />
            <Link className="text-xs text-primary hover:underline" href="/list">
              すべて表示
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {recent.map((s) => (
              <ActivityItem key={s.id} session={s} now={now} />
            ))}
          </ul>
        </div>
      </div>

      {/* 状態別カウント（4 種、色は STATUS_CARD_BG と統一） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StageCard label="編集中"   count={stageCounts.edit} bg={STATUS_CARD_BG.edit} icon={STATUS_ICON["編集中"]}   href="/list?state=%E7%B7%A8%E9%9B%86%E4%B8%AD" />
        <StageCard label="質問公開" count={stageCounts.qpub} bg={STATUS_CARD_BG.qpub} icon={STATUS_ICON["質問公開"]} href="/list?state=%E8%B3%AA%E5%95%8F%E5%85%AC%E9%96%8B" />
        <StageCard label="面談済"   count={stageCounts.itv}  bg={STATUS_CARD_BG.itv}  icon={STATUS_ICON["面談済"]}   href="/list?state=%E9%9D%A2%E8%AB%87%E6%B8%88" />
        <StageCard label="評価済"   count={stageCounts.eval} bg={STATUS_CARD_BG.eval} icon={STATUS_ICON["評価済"]}   href="/list?state=%E8%A9%95%E4%BE%A1%E6%B8%88" />
      </div>
    </div>
  );
}

function Header({ now }: { now: Date }) {
  return (
    <div className="flex items-center gap-3">
      <h1 className="font-bold text-lg">ホーム</h1>
      <div className="text-sm text-muted-foreground tabular">
        {now.getFullYear()}/{now.getMonth() + 1}/{now.getDate()}
      </div>
    </div>
  );
}

function ActivityItem({ session, now }: { session: SessionMeta; now: Date }) {
  const label =
    session.status === "評価済"
      ? `評価済（${typeof session.総合スコア === "number" ? session.総合スコア.toFixed(1) : "―"} / ${session.合否 ?? "―"}）`
      : session.status;

  return (
    <li className="flex items-center gap-3">
      {/* 色 + アイコン併記で色覚多様性に対応 */}
      <span
        className={`w-2 h-2 rounded-full ${STATUS_DOT[session.status]} shrink-0`}
        aria-hidden="true"
      />
      <span className="text-sm leading-none shrink-0" aria-hidden="true">
        {STATUS_ICON[session.status]}
      </span>
      <Link
        href={`/sessions/${session.id}`}
        className="font-medium text-foreground hover:underline truncate"
      >
        {session.氏名}
      </Link>
      <span className="text-muted-foreground truncate">— {label}</span>
      <div className="flex-1" />
      <span className="text-2xs text-muted-foreground opacity-70 shrink-0 tabular">
        {relativeTime(session.作成日時, now)}
      </span>
    </li>
  );
}

function StageCard({
  label,
  count,
  bg,
  icon,
  href,
}: {
  label: string;
  count: number;
  bg: string;
  icon: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className={`${bg} text-white rounded-xl p-4 shadow-sm relative overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition`}
    >
      <div className="text-3xl font-bold tabular">{count}</div>
      <div className="text-sm mt-1 opacity-90">{label}</div>
      <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">{icon}</div>
    </Link>
  );
}

/* ────────── 0 件時 (empty state) 専用の部品 ────────── */

function MutedKpiCard({ label, main, sub }: { label: string; main: string; sub: string }) {
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
      <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">{icon}</div>
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
  const li = (
    <li
      className={
        "flex items-center gap-3 rounded-lg px-2 py-1.5 " +
        (active ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-muted/60")
      }
    >
      <span
        className={
          "w-6 h-6 rounded-full flex items-center justify-center text-2xs font-bold shrink-0 " +
          (active ? "bg-emerald-600 text-white" : "bg-muted text-muted-foreground")
        }
      >
        {num}
      </span>
      <span className={active ? "font-medium" : "text-muted-foreground"}>{label}</span>
      {href && (
        <>
          <div className="flex-1" />
          <span className="text-xs text-primary">→</span>
        </>
      )}
    </li>
  );
  return href ? <Link href={href}>{li}</Link> : li;
}
