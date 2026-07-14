import type { MonthlyBucket } from "@/lib/analytics";

/**
 * 月別 積み上げ棒グラフ（合格/普通/不合格 の 3 色 stack）。
 * 各柱の上に月次合格率 % を表示。
 */
export function MonthlyStackedChart({
  monthly,
}: {
  monthly: MonthlyBucket[];
}) {
  // "unknown" 月は末尾に置く。それ以外は YYYY-MM 昇順
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

  const W = 720;
  const H = 220;
  const padL = 40;
  const padR = 20;
  const padT = 12;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const maxCount = Math.max(...sorted.map((m) => m.total), 1);

  const barGap = 8;
  const barW = Math.max(
    (innerW - barGap * (sorted.length - 1)) / sorted.length,
    8,
  );

  return (
    <div className="space-y-2">
      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto min-w-[520px]">
          {/* Y grid */}
          {[0, 0.5, 1].map((r, i) => (
            <line
              key={i}
              x1={padL}
              x2={W - padR}
              y1={padT + innerH * (1 - r)}
              y2={padT + innerH * (1 - r)}
              stroke="hsl(var(--border))"
              strokeDasharray={r === 0 ? undefined : "2 4"}
            />
          ))}
          {[0, 0.5, 1].map((r, i) => (
            <text
              key={i}
              x={padL - 6}
              y={padT + innerH * (1 - r) + 3}
              fontSize="10"
              fill="hsl(var(--muted-foreground))"
              textAnchor="end"
            >
              {Math.round(maxCount * r)}
            </text>
          ))}

          {sorted.map((m, i) => {
            const x = padL + i * (barW + barGap);
            const hPass = (m.pass / maxCount) * innerH;
            const hMid = (m.mid / maxCount) * innerH;
            const hFail = (m.fail / maxCount) * innerH;
            const yPass = padT + innerH - hPass;
            const yMid = yPass - hMid;
            const yFail = yMid - hFail;
            const passRate = m.total > 0 ? m.pass / m.total : 0;
            const label = m.month === "unknown" ? "不明" : m.month.slice(2);
            return (
              <g key={m.month}>
                {m.fail > 0 && (
                  <rect
                    x={x}
                    y={yFail}
                    width={barW}
                    height={hFail}
                    fill="hsl(0 72% 55%)"
                    opacity="0.85"
                  >
                    <title>{`${m.month} · 不合格 ${m.fail}`}</title>
                  </rect>
                )}
                {m.mid > 0 && (
                  <rect
                    x={x}
                    y={yMid}
                    width={barW}
                    height={hMid}
                    fill="hsl(38 92% 55%)"
                    opacity="0.85"
                  >
                    <title>{`${m.month} · 普通 ${m.mid}`}</title>
                  </rect>
                )}
                {m.pass > 0 && (
                  <rect
                    x={x}
                    y={yPass}
                    width={barW}
                    height={hPass}
                    fill="hsl(160 70% 45%)"
                  >
                    <title>{`${m.month} · 合格 ${m.pass}`}</title>
                  </rect>
                )}
                <text
                  x={x + barW / 2}
                  y={padT + innerH + 14}
                  fontSize="10"
                  fill="hsl(var(--muted-foreground))"
                  textAnchor="middle"
                >
                  {label}
                </text>
                {m.total > 0 && (
                  <text
                    x={x + barW / 2}
                    y={yFail - 4}
                    fontSize="10"
                    fill="hsl(var(--primary))"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {(passRate * 100).toFixed(0)}%
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex items-center justify-center gap-4 text-2xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-emerald-500" /> 合格
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-amber-500" /> 普通
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-4 rounded-sm bg-rose-500" /> 不合格
        </span>
        <span className="text-primary font-medium">数字 = 月次合格率</span>
      </div>
    </div>
  );
}
