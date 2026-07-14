import type { MonthlyBucket } from "@/lib/analytics";

/**
 * 月別 コンパクト表：月 / 件数 / 合格率 / 分布（内联の 3 色 stacked bar）。
 * 縦圧縮版として MonthlyStackedChart を置き換え。
 */
export function MonthlyBreakdown({ monthly }: { monthly: MonthlyBucket[] }) {
  // "unknown" 月は末尾に。それ以外は YYYY-MM 昇順（時系列で追いやすい）
  const sorted = [...monthly].sort((a, b) => {
    if (a.month === "unknown") return 1;
    if (b.month === "unknown") return -1;
    return a.month.localeCompare(b.month);
  });

  if (sorted.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        月別データがありません。
      </div>
    );
  }

  const maxCount = Math.max(...sorted.map((m) => m.total), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-2xs text-muted-foreground border-b">
          <tr>
            <th className="text-left px-2 py-1.5 w-24">月</th>
            <th className="text-right px-2 py-1.5 w-16">件数</th>
            <th className="text-right px-2 py-1.5 w-16">合格率</th>
            <th className="text-left px-2 py-1.5">分布（幅 = 最多月比）</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sorted.map((m) => {
            const rate = m.total > 0 ? m.pass / m.total : 0;
            const passW = (m.pass / maxCount) * 100;
            const midW = (m.mid / maxCount) * 100;
            const failW = (m.fail / maxCount) * 100;
            const rateCls =
              rate >= 0.6
                ? "text-emerald-600 dark:text-emerald-400"
                : rate >= 0.4
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-rose-600 dark:text-rose-400";
            const label = m.month === "unknown" ? "不明" : m.month;
            return (
              <tr
                key={m.month}
                className="hover:bg-accent/30 transition-colors"
              >
                <td className="px-2 py-1.5 tabular text-xs">{label}</td>
                <td className="px-2 py-1.5 text-right tabular text-xs">
                  {m.total}
                </td>
                <td
                  className={`px-2 py-1.5 text-right tabular text-xs font-semibold ${rateCls}`}
                >
                  {m.total > 0 ? `${(rate * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="px-2 py-1.5">
                  <div
                    className="flex h-2 rounded overflow-hidden bg-muted/40"
                    title={`合格 ${m.pass} / 普通 ${m.mid} / 不合格 ${m.fail}`}
                  >
                    {passW > 0 && (
                      <div
                        className="bg-emerald-500"
                        style={{ width: `${passW}%` }}
                        title={`合格 ${m.pass}`}
                      />
                    )}
                    {midW > 0 && (
                      <div
                        className="bg-amber-500"
                        style={{ width: `${midW}%` }}
                        title={`普通 ${m.mid}`}
                      />
                    )}
                    {failW > 0 && (
                      <div
                        className="bg-rose-500"
                        style={{ width: `${failW}%` }}
                        title={`不合格 ${m.fail}`}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-center gap-4 text-2xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-emerald-500" /> 合格
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-amber-500" /> 普通
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-rose-500" /> 不合格
        </span>
      </div>
    </div>
  );
}
