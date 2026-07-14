import type { AxisVerdictBucket } from "@/lib/analytics";

/**
 * 軸別 「合格者 vs 不合格者」の平均スコアを 2 本並列 bar で比較。
 * 大分類（人間性 / 技術力 / 分類なし）でグループ化してバンドラベル付き。
 * 右端に Δ（差分）を表示し、差が大きい軸ほど強調。
 */
export function AxisComparisonBars({ data }: { data: AxisVerdictBucket[] }) {
  const catGroups: {
    key: "人間性" | "技術力" | "分類なし";
    label: string;
    labelCls: string;
    borderCls: string;
    items: AxisVerdictBucket[];
  }[] = [
    {
      key: "人間性",
      label: "人間性",
      labelCls: "text-amber-800 dark:text-amber-300",
      borderCls:
        "border-amber-400/60 bg-amber-100/40 dark:bg-amber-500/10",
      items: data.filter((d) => d.大分類 === "人間性"),
    },
    {
      key: "技術力",
      label: "技術力",
      labelCls: "text-indigo-800 dark:text-indigo-300",
      borderCls:
        "border-indigo-400/60 bg-indigo-100/40 dark:bg-indigo-500/10",
      items: data.filter((d) => d.大分類 === "技術力"),
    },
    {
      key: "分類なし",
      label: "分類なし",
      labelCls: "text-muted-foreground",
      borderCls: "border-border bg-muted/50",
      items: data.filter((d) => d.大分類 === undefined),
    },
  ];

  if (data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-8 text-center">
        軸データがありません。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {catGroups.map(
        (g) =>
          g.items.length > 0 && (
            <div key={g.key}>
              <div
                className={`inline-block text-2xs font-bold px-2 py-0.5 rounded border ${g.borderCls} ${g.labelCls} mb-2`}
              >
                {g.label}
              </div>
              <div className="space-y-2">
                {g.items.map((d) => (
                  <AxisRow key={d.軸} d={d} />
                ))}
              </div>
            </div>
          ),
      )}
      <div className="border-t pt-3 flex items-center justify-center gap-4 text-2xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-emerald-500" /> 合格者 平均
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-rose-500" /> 不合格者 平均
        </span>
        <span className="text-muted-foreground/70">
          Δ が大きい軸 = 合否を分ける決定要因
        </span>
      </div>
    </div>
  );
}

function AxisRow({ d }: { d: AxisVerdictBucket }) {
  const passW = (d.passAvg / 5) * 100;
  const failW = (d.failAvg / 5) * 100;
  const diffCls =
    d.diff >= 1.5
      ? "text-primary font-bold"
      : d.diff >= 1.0
        ? "text-primary"
        : "text-muted-foreground";
  return (
    <div className="grid grid-cols-[110px_1fr_60px] gap-3 items-center text-xs">
      <div className="truncate font-medium" title={d.軸}>
        {d.軸}
      </div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="flex-1 relative h-3 bg-muted rounded overflow-hidden">
            {d.passCount > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500 rounded"
                style={{ width: `${passW}%` }}
              />
            )}
          </div>
          <span className="tabular text-2xs text-emerald-700 dark:text-emerald-400 font-medium w-8 text-right">
            {d.passCount > 0 ? d.passAvg.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1 relative h-3 bg-muted rounded overflow-hidden">
            {d.failCount > 0 && (
              <div
                className="absolute inset-y-0 left-0 bg-rose-500 rounded"
                style={{ width: `${failW}%` }}
              />
            )}
          </div>
          <span className="tabular text-2xs text-rose-700 dark:text-rose-400 font-medium w-8 text-right">
            {d.failCount > 0 ? d.failAvg.toFixed(1) : "—"}
          </span>
        </div>
      </div>
      <div className={`tabular text-2xs text-right ${diffCls}`}>
        {d.passCount > 0 && d.failCount > 0 ? `Δ ${d.diff.toFixed(1)}` : "—"}
      </div>
    </div>
  );
}
