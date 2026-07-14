import { AlertTriangle, Lightbulb, Target } from "lucide-react";
import type {
  AxisVerdictBucket,
  MonthlyBucket,
  RoleBucket,
} from "@/lib/analytics";
import { rolePillClass } from "@/lib/uiClass";

/**
 * 3 枚の自動洞察カード:
 *   1. 合否を分ける最重要軸（軸別 diff 最大）
 *   2. 合格率トップ役割
 *   3. 要注意（直近月の合格率急落 or 合格率最低の役割）
 * データがゼロのケースはカード自体を「特記なし」に fallback。
 */
export function InsightStrip({
  axisData,
  roleData,
  monthly,
}: {
  axisData: AxisVerdictBucket[];
  roleData: RoleBucket[];
  monthly: MonthlyBucket[];
}) {
  const eligibleAxes = axisData.filter(
    (a) => a.passCount > 0 && a.failCount > 0,
  );
  const topDiff = [...eligibleAxes].sort((a, b) => b.diff - a.diff)[0];

  const bestRole = [...roleData].sort((a, b) => b.passRate - a.passRate)[0];
  const worstRole = [...roleData]
    .filter((r) => r.total >= 2)
    .sort((a, b) => a.passRate - b.passRate)[0];

  const sortedMonthly = [...monthly]
    .filter((m) => m.month !== "unknown")
    .sort((a, b) => a.month.localeCompare(b.month));
  const cur = sortedMonthly[sortedMonthly.length - 1];
  const prev = sortedMonthly[sortedMonthly.length - 2];
  const curRate = cur && cur.total > 0 ? cur.pass / cur.total : 0;
  const prevRate = prev && prev.total > 0 ? prev.pass / prev.total : 0;
  const trendDelta = cur && prev ? (curRate - prevRate) * 100 : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <InsightCard
        icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
        title="合否を分ける最重要軸"
        body={
          topDiff ? (
            <>
              <span className="font-bold text-foreground">{topDiff.軸}</span>{" "}
              で合格者と不合格者に{" "}
              <span className="text-primary font-bold tabular">
                Δ {topDiff.diff.toFixed(1)}
              </span>{" "}
              差。次の面談ではこの軸の質問を厚めに。
            </>
          ) : (
            <span className="text-muted-foreground">
              合格者 / 不合格者 の両方が揃った軸がまだありません。
            </span>
          )
        }
        tone="amber"
      />
      <InsightCard
        icon={<Target className="h-4 w-4 text-emerald-500" />}
        title="合格率トップ役割"
        body={
          bestRole && bestRole.total > 0 ? (
            <>
              <span className={rolePillClass(bestRole.役割)}>
                {bestRole.役割}
              </span>{" "}
              が{" "}
              <span className="text-emerald-600 font-bold tabular">
                {(bestRole.passRate * 100).toFixed(0)}%
              </span>{" "}
              。求人条件が募集層と合致していそう。
            </>
          ) : (
            <span className="text-muted-foreground">役割データなし。</span>
          )
        }
        tone="emerald"
      />
      <InsightCard
        icon={<AlertTriangle className="h-4 w-4 text-rose-500" />}
        title={
          trendDelta < -5
            ? "合格率が低下傾向"
            : worstRole
              ? "要注意な役割"
              : "特記なし"
        }
        body={
          trendDelta < -5 ? (
            <>
              直近月の合格率が前月比{" "}
              <span className="text-rose-600 font-bold tabular">
                {trendDelta.toFixed(0)}%
              </span>{" "}
              。判断基準の見直しか、求人記述の再確認を検討。
            </>
          ) : worstRole ? (
            <>
              <span className={rolePillClass(worstRole.役割)}>
                {worstRole.役割}
              </span>{" "}
              の合格率が{" "}
              <span className="text-rose-600 font-bold tabular">
                {(worstRole.passRate * 100).toFixed(0)}%
              </span>{" "}
              。求人条件と応募者スキルのギャップを確認。
            </>
          ) : (
            <span className="text-muted-foreground">
              現時点で顕著な問題なし。継続監視。
            </span>
          )
        }
        tone="rose"
      />
    </div>
  );
}

function InsightCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  tone: "amber" | "emerald" | "rose";
}) {
  const bg =
    tone === "amber"
      ? "bg-amber-50/50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/50"
      : tone === "emerald"
        ? "bg-emerald-50/50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800/50"
        : "bg-rose-50/50 dark:bg-rose-900/10 border-rose-200 dark:border-rose-800/50";
  return (
    <div className={`rounded-lg border p-4 ${bg}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <div className="text-xs font-bold">{title}</div>
      </div>
      <div className="text-sm leading-relaxed">{body}</div>
    </div>
  );
}
