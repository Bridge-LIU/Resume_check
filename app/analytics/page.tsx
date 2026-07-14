import {
  aggregateByAxis,
  aggregateByAxisWithVerdict,
  aggregateByMonth,
  aggregateByRole,
  listAnonymizedSummaries,
} from "@/lib/analytics";
import { listSessions } from "@/lib/storage";
import { REJECT_REASONS, type RejectReason } from "@/lib/types";
import { DetailTable } from "./_components/DetailTable";
import { HeroBand } from "./_components/HeroBand";
import { SectionCard } from "./_components/SectionCard";
import { KpiRow } from "./_components/KpiRow";
import { InsightStrip } from "./_components/InsightStrip";
import { MonthlyBreakdown } from "./_components/MonthlyBreakdown";
import { AxisComparisonBars } from "./_components/AxisComparisonBars";
import { RoleCards } from "./_components/RoleCards";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const items = listAnonymizedSummaries();

  // 不採用理由は生の SessionMeta を対象に集計（匿名サマリには reason が入らないため）。
  // items が 0 でも表示できるように独立して計算。
  const rejectStats = aggregateRejectReasons(listSessions());

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <div className="bg-card rounded-xl border shadow-sm">
          <div className="p-6 space-y-3">
            <h1 className="font-bold text-lg">面談分析ダッシュボード</h1>
            <div className="text-sm text-muted-foreground leading-relaxed">
              匿名サマリがまだ 1 件もありません。
              <br />
              保存期間スイープが <code>analytics/</code> に匿名サマリを書き出した時点で
              このページに集計が出ます。
            </div>
            <div className="text-xs text-muted-foreground border-t pt-3">
              参考：このデータは PII（氏名・履歴書・面談内容）を含まない匿名集計です。
              元のセッションが完全削除されても残せます。
            </div>
          </div>
        </div>

        {/* 匿名サマリが 0 でも「不採用理由」だけは生データから即出せる */}
        <RejectReasonsSection stats={rejectStats} />
      </div>
    );
  }

  const monthly = aggregateByMonth(items);
  const roleData = aggregateByRole(items);
  const axisData = aggregateByAxisWithVerdict(items);
  const axisBuckets = aggregateByAxis(items); // DetailTable の列定義に使用

  const total = items.length;
  const pass = items.filter((i) => i.合否 === "合格").length;
  const avgTotal = items.reduce((s, i) => s + i.総合スコア, 0) / total;
  const roleCount = roleData.length;

  return (
    <div className="space-y-4">
      {/* 段 1: Hero */}
      <HeroBand total={total} pass={pass} />

      {/* 段 2: コア指標 */}
      <SectionCard
        title="コア指標"
        question="今の全体像は？ 直近月は前月と比べてどうか？"
      >
        <KpiRow
          total={total}
          pass={pass}
          avgTotal={avgTotal}
          roleCount={roleCount}
          monthly={monthly}
        />
      </SectionCard>

      {/* 段 3: インサイト strip（自動洞察） */}
      <SectionCard
        title="インサイト"
        question="このデータから何を読み取ればいい？"
        right={
          <span className="text-2xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            自動生成
          </span>
        }
      >
        <InsightStrip
          axisData={axisData}
          roleData={roleData}
          monthly={monthly}
        />
      </SectionCard>

      {/* 段 4: 月別トレンド */}
      <SectionCard
        title="月別トレンド"
        question="合格 / 普通 / 不合格 の構成は時間とともにどう変わっている？"
      >
        <MonthlyBreakdown monthly={monthly} />
      </SectionCard>

      {/* 段 5: 軸別分析 */}
      <SectionCard
        title="軸別分析"
        question="どの評価軸が合否を左右している？ どの軸で全体的に強い / 弱い？"
      >
        <AxisComparisonBars data={axisData} />
      </SectionCard>

      {/* 段 6: 役割別 */}
      <SectionCard
        title="役割別"
        question="どの役割の合格率が高い / 低い？"
      >
        <RoleCards data={roleData} />
      </SectionCard>

      {/* 段 7: 不採用理由（生 SessionMeta 由来） */}
      <RejectReasonsSection stats={rejectStats} />

      {/* 明細（既存 DetailTable、既に磨き済み） */}
      <DetailTable items={items} axes={axisBuckets} />

      <div className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
        ⚠️ 匿名サマリは <code className="bg-muted px-1 rounded">data/analytics/</code>{" "}
        に保存。氏名・履歴書・面談内容は含まず、元セッションが完全削除されても統計だけは
        長期保持できます。
      </div>
    </div>
  );
}

/* ────────── 不採用理由の集計 ────────── */

interface RejectStats {
  /** "不採用" セッションの総数 */
  total: number;
  /** 理由未記入（過去データ）のセッション数 */
  unrecorded: number;
  /** 理由ごとの件数（複数選択なので合計は total を超えることがある） */
  byReason: { reason: RejectReason; count: number }[];
}

function aggregateRejectReasons(
  sessions: { result: string; rejectReasons?: RejectReason[] }[],
): RejectStats {
  const rejects = sessions.filter((s) => s.result === "不採用");
  const counts = new Map<RejectReason, number>();
  let unrecorded = 0;
  for (const s of rejects) {
    const rs = s.rejectReasons ?? [];
    if (rs.length === 0) {
      unrecorded++;
      continue;
    }
    for (const r of rs) {
      counts.set(r, (counts.get(r) ?? 0) + 1);
    }
  }
  const byReason = REJECT_REASONS.map((r) => ({
    reason: r,
    count: counts.get(r) ?? 0,
  })).filter((r) => r.count > 0);
  byReason.sort((a, b) => b.count - a.count);
  return { total: rejects.length, unrecorded, byReason };
}

function RejectReasonsSection({ stats }: { stats: RejectStats }) {
  if (stats.total === 0) return null;
  const max = Math.max(...stats.byReason.map((r) => r.count), 1);
  return (
    <SectionCard
      title="不採用理由の内訳"
      question="なぜ落ちているか？ 記入済みの理由から傾向を読む"
      right={
        <div className="flex items-center gap-2">
          <span className="text-2xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
            {stats.total} 件中 · 複数選択可
          </span>
          {stats.unrecorded > 0 && (
            <span className="text-2xs text-amber-700 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-500/10 border border-amber-300/60 dark:border-amber-500/40 rounded-full px-2 py-0.5">
              未記入 {stats.unrecorded}
            </span>
          )}
        </div>
      }
    >
      {stats.byReason.length === 0 ? (
        <div className="text-sm text-muted-foreground">
          記入済みの不採用理由がまだありません。
        </div>
      ) : (
        <div className="space-y-2">
          {stats.byReason.map((r) => {
            const pct = (r.count / stats.total) * 100;
            const barPct = (r.count / max) * 100;
            return (
              <div key={r.reason} className="text-sm">
                <div className="flex items-baseline gap-3 mb-1">
                  <span className="font-medium w-40 shrink-0">{r.reason}</span>
                  <span className="tabular text-base font-semibold">
                    {r.count}
                  </span>
                  <span className="text-xs text-muted-foreground opacity-70 tabular">
                    {pct.toFixed(0)}% of {stats.total}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded overflow-hidden">
                  <div
                    className="h-full bg-rose-500/85 rounded"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
