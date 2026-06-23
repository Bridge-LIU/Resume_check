import Link from "next/link";
import {
  aggregateByAxis,
  aggregateByMonth,
  aggregateByRole,
  listAnonymizedSummaries,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

function pct(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function rolePillClass(役割: string) {
  if (役割.startsWith("NW")) return "pill pill-role-nw";
  if (役割.startsWith("Dev") || 役割.startsWith("開発")) return "pill pill-role-dev";
  if (役割.startsWith("Server")) return "pill pill-role-sv";
  if (役割.startsWith("Special")) return "pill pill-role-sp";
  if (役割.startsWith("PMO")) return "pill pill-role-pm";
  if (役割.startsWith("IT")) return "pill pill-role-it";
  return "pill bg-zinc-100 text-zinc-700";
}

function barColor(score: number): string {
  if (score >= 4.2) return "bg-emerald-500";
  if (score >= 3.5) return "bg-amber-500";
  return "bg-red-400";
}

export default async function AnalyticsPage() {
  const items = listAnonymizedSummaries();
  const monthly = aggregateByMonth(items);
  const byRole = aggregateByRole(items);
  const byAxis = aggregateByAxis(items);

  const overall = {
    total: items.length,
    pass: items.filter((i) => i.合否 === "合格").length,
    avgTotal:
      items.length > 0
        ? items.reduce((s, i) => s + i.総合スコア, 0) / items.length
        : 0,
    earliest:
      items
        .map((i) => i.closedAt)
        .filter((c): c is string => !!c)
        .sort()[0] ?? null,
    latest:
      items
        .map((i) => i.closedAt)
        .filter((c): c is string => !!c)
        .sort()
        .reverse()[0] ?? null,
  };

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-6 space-y-3">
          <h2 className="font-bold text-lg">分析（匿名サマリ）</h2>
          <div className="text-sm text-zinc-500 leading-relaxed">
            匿名サマリがまだ 1 件もありません。
            <br />
            保存期間スイープが <code>analytics/</code> に匿名サマリを書き出した時点で
            このページに集計が出ます。
          </div>
          <div className="text-xs text-zinc-500 border-t pt-3">
            参考：このデータは PII（氏名・履歴書・議事録）を含まない匿名集計です。
            設計書 §7.5。元のセッションが完全削除されても残せます。
          </div>
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← 一覧へ戻る
          </Link>
        </div>
      </div>
    );
  }

  const maxMonthlyTotal = Math.max(...monthly.map((m) => m.total), 1);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm">
        <header className="px-6 py-3 border-b flex items-center gap-4">
          <h2 className="font-bold">分析（匿名サマリ）</h2>
          <span className="text-xs text-zinc-500">
            {items.length} 件 ・ {overall.earliest?.slice(0, 10) ?? "—"} 〜{" "}
            {overall.latest?.slice(0, 10) ?? "—"}
          </span>
        </header>

        {/* KPI カード */}
        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="累計件数" value={overall.total.toString()} suffix="件" />
          <KpiCard
            label="合格率"
            value={pct(overall.pass / overall.total)}
            tint="text-emerald-700"
          />
          <KpiCard
            label="平均総合スコア"
            value={overall.avgTotal.toFixed(2)}
            suffix={`/ 5`}
          />
          <KpiCard label="役割数" value={byRole.length.toString()} suffix="種" />
        </div>
      </div>

      {/* 月別 */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-3 border-b flex items-center gap-3">
          <h3 className="font-bold">月別の合否（{monthly.length} 月分）</h3>
          <span className="text-xs text-zinc-500">closedAt 基準</span>
        </div>
        <div className="p-6">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="text-left px-2 py-1 w-28">月</th>
                <th className="text-right px-2 py-1 w-16">件数</th>
                <th className="text-right px-2 py-1 w-16">平均</th>
                <th className="text-right px-2 py-1 w-16">合格率</th>
                <th className="text-left px-2 py-1">分布</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {monthly.map((m) => {
                const passRate = m.total > 0 ? m.pass / m.total : 0;
                const wPass = (m.pass / maxMonthlyTotal) * 100;
                const wMid = (m.mid / maxMonthlyTotal) * 100;
                const wFail = (m.fail / maxMonthlyTotal) * 100;
                return (
                  <tr key={m.month} className="hover:bg-zinc-50">
                    <td className="px-2 py-2 font-medium tabular">{m.month}</td>
                    <td className="px-2 py-2 text-right tabular">{m.total}</td>
                    <td className="px-2 py-2 text-right tabular">
                      {m.avgTotal.toFixed(2)}
                    </td>
                    <td className="px-2 py-2 text-right tabular">
                      <span
                        className={
                          passRate >= 0.5
                            ? "text-emerald-700"
                            : passRate >= 0.3
                              ? "text-amber-700"
                              : "text-red-700"
                        }
                      >
                        {pct(passRate)}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex h-3 rounded overflow-hidden bg-zinc-100">
                        <div
                          className="bg-emerald-400"
                          style={{ width: `${wPass}%` }}
                          title={`合格 ${m.pass}`}
                        />
                        <div
                          className="bg-amber-400"
                          style={{ width: `${wMid}%` }}
                          title={`普通 ${m.mid}`}
                        />
                        <div
                          className="bg-red-400"
                          style={{ width: `${wFail}%` }}
                          title={`不合格 ${m.fail}`}
                        />
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-0.5 tabular">
                        合格 {m.pass} / 普通 {m.mid} / 不合格 {m.fail}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 役割別 */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-3 border-b flex items-center gap-3">
          <h3 className="font-bold">役割別</h3>
        </div>
        <div className="p-6">
          <table className="w-full text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="text-left px-2 py-1">役割</th>
                <th className="text-right px-2 py-1 w-20">件数</th>
                <th className="text-right px-2 py-1 w-20">平均</th>
                <th className="text-right px-2 py-1 w-20">合格</th>
                <th className="text-right px-2 py-1 w-20">合格率</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {byRole.map((r) => (
                <tr key={r.役割} className="hover:bg-zinc-50">
                  <td className="px-2 py-2">
                    <span className={rolePillClass(r.役割)}>{r.役割}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular">{r.total}</td>
                  <td className="px-2 py-2 text-right tabular">
                    {r.avgTotal.toFixed(2)}
                  </td>
                  <td className="px-2 py-2 text-right tabular">{r.pass}</td>
                  <td className="px-2 py-2 text-right tabular">
                    <span
                      className={
                        r.passRate >= 0.5
                          ? "text-emerald-700"
                          : r.passRate >= 0.3
                            ? "text-amber-700"
                            : "text-red-700"
                      }
                    >
                      {pct(r.passRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 軸別 */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-3 border-b flex items-center gap-3">
          <h3 className="font-bold">軸別の平均スコア</h3>
          <span className="text-xs text-zinc-500">全候補者平均</span>
        </div>
        <div className="p-6 space-y-2">
          {byAxis.map((a) => (
            <div key={a.軸} className="text-sm">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="font-medium w-36">{a.軸}</span>
                <span className="tabular text-base">{a.avgScore.toFixed(2)}</span>
                <span className="text-xs text-zinc-400 tabular">
                  範囲 {a.minScore.toFixed(1)}〜{a.maxScore.toFixed(1)} ({a.count} 件)
                </span>
              </div>
              <div className="h-2 bg-zinc-100 rounded overflow-hidden">
                <div
                  className={`h-full ${barColor(a.avgScore)}`}
                  style={{ width: `${(a.avgScore / 5) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="text-xs text-zinc-500 leading-relaxed">
        ⚠️ 匿名サマリは <code>data/analytics/&lt;idHash&gt;.json</code> に保存。
        氏名・履歴書・議事録は含みません（設計書 §7.5）。元セッションが完全削除されても
        統計だけは長期保持できます。
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  tint,
}: {
  label: string;
  value: string;
  suffix?: string;
  tint?: string;
}) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-zinc-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold tabular ${tint ?? ""}`}>{value}</span>
        {suffix && <span className="text-xs text-zinc-400">{suffix}</span>}
      </div>
    </div>
  );
}
