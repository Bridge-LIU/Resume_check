/**
 * 横断比較用レーダーチャート（純 SVG / 依存ゼロ / Server Component で動く）。
 *
 * - 各候補者をひとつのポリゴンとして重ね描き
 * - 軸はユニオン（どれか1人でも持っていれば描画）
 * - 値の無い軸は中心扱い（ポリゴン形状で穴になる）
 */

const PALETTE = [
  { stroke: "#2563eb", fill: "rgba(37, 99, 235, 0.12)", dot: "#1d4ed8" },   // blue
  { stroke: "#059669", fill: "rgba(5, 150, 105, 0.12)", dot: "#047857" },   // emerald
  { stroke: "#d97706", fill: "rgba(217, 119, 6, 0.12)", dot: "#b45309" },   // amber
  { stroke: "#dc2626", fill: "rgba(220, 38, 38, 0.12)", dot: "#b91c1c" },   // red
  { stroke: "#7c3aed", fill: "rgba(124, 58, 237, 0.12)", dot: "#6d28d9" },  // violet
  { stroke: "#0891b2", fill: "rgba(8, 145, 178, 0.12)", dot: "#0e7490" },   // cyan
];

export interface RadarCandidate {
  id: string;
  label: string; // 氏名
  /** 軸名 → スコア（0〜scaleMax）。欠損は描画時 0 扱い */
  values: Map<string, number>;
}

export function RadarChart({
  axes,
  candidates,
  scaleMax = 5,
  size = 360,
}: {
  axes: string[];
  candidates: RadarCandidate[];
  scaleMax?: number;
  size?: number;
}) {
  if (axes.length < 3) {
    return (
      <div className="border rounded-lg p-6 text-sm text-zinc-500 text-center">
        レーダーチャートは評価軸が 3 つ以上必要です（現在 {axes.length} 軸）。
      </div>
    );
  }
  if (candidates.length === 0) {
    return (
      <div className="border rounded-lg p-6 text-sm text-zinc-500 text-center">
        評価済の候補者がありません。
      </div>
    );
  }

  const padding = 60;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - padding * 2) / 2;
  const angleStep = (Math.PI * 2) / axes.length;

  // 各軸の単位ベクトル（上方向=12時を起点に時計回り）
  const axisVectors = axes.map((_, i) => {
    const angle = -Math.PI / 2 + i * angleStep;
    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };
  });

  // グリッドの段数
  const gridSteps = scaleMax; // 1, 2, ... scaleMax
  const gridLevels = Array.from({ length: gridSteps }, (_, i) => (i + 1) / scaleMax);

  function polygonPath(scores: number[]): string {
    return scores
      .map((s, i) => {
        const r = (Math.max(0, Math.min(scaleMax, s)) / scaleMax) * radius;
        const v = axisVectors[i];
        return `${(cx + v.x * r).toFixed(2)},${(cy + v.y * r).toFixed(2)}`;
      })
      .join(" ");
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-4">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="flex-shrink-0"
          role="img"
          aria-label={`レーダーチャート: ${candidates.map((c) => c.label).join(", ")}`}
        >
          {/* グリッド */}
          {gridLevels.map((level, idx) => (
            <polygon
              key={`grid-${idx}`}
              points={axisVectors
                .map((v) => {
                  const r = level * radius;
                  return `${(cx + v.x * r).toFixed(2)},${(cy + v.y * r).toFixed(2)}`;
                })
                .join(" ")}
              fill="none"
              stroke={idx === gridLevels.length - 1 ? "#a1a1aa" : "#e4e4e7"}
              strokeWidth={idx === gridLevels.length - 1 ? 1 : 0.75}
            />
          ))}

          {/* 軸線 */}
          {axisVectors.map((v, i) => (
            <line
              key={`axis-${i}`}
              x1={cx}
              y1={cy}
              x2={(cx + v.x * radius).toFixed(2)}
              y2={(cy + v.y * radius).toFixed(2)}
              stroke="#d4d4d8"
              strokeWidth={0.75}
            />
          ))}

          {/* 候補者ポリゴン */}
          {candidates.map((cand, idx) => {
            const color = PALETTE[idx % PALETTE.length];
            const scores = axes.map((axis) => cand.values.get(axis) ?? 0);
            return (
              <g key={cand.id}>
                <polygon
                  points={polygonPath(scores)}
                  fill={color.fill}
                  stroke={color.stroke}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
                {scores.map((s, i) => {
                  const r =
                    (Math.max(0, Math.min(scaleMax, s)) / scaleMax) * radius;
                  const v = axisVectors[i];
                  return (
                    <circle
                      key={`dot-${cand.id}-${i}`}
                      cx={(cx + v.x * r).toFixed(2)}
                      cy={(cy + v.y * r).toFixed(2)}
                      r={2.5}
                      fill={color.dot}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* 軸ラベル */}
          {axes.map((axis, i) => {
            const v = axisVectors[i];
            const labelDist = radius + 18;
            const tx = cx + v.x * labelDist;
            const ty = cy + v.y * labelDist;
            // ラベルのテキストアンカーを軸方向に合わせる
            const anchor =
              v.x > 0.2 ? "start" : v.x < -0.2 ? "end" : "middle";
            return (
              <text
                key={`label-${i}`}
                x={tx.toFixed(2)}
                y={ty.toFixed(2)}
                fontSize={11}
                fill="#3f3f46"
                textAnchor={anchor}
                dominantBaseline="middle"
              >
                {axis}
              </text>
            );
          })}

          {/* スケール目盛り（最上段の頂点に数値） */}
          {gridLevels.map((level, idx) => (
            <text
              key={`scale-${idx}`}
              x={cx + 4}
              y={(cy - level * radius).toFixed(2)}
              fontSize={9}
              fill="#a1a1aa"
              dominantBaseline="middle"
            >
              {(level * scaleMax).toFixed(0)}
            </text>
          ))}
        </svg>

        <div className="flex-1 space-y-2 text-sm">
          <div className="font-medium text-zinc-700">凡例</div>
          <ul className="space-y-1.5">
            {candidates.map((cand, idx) => {
              const color = PALETTE[idx % PALETTE.length];
              return (
                <li key={cand.id} className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-sm border"
                    style={{ backgroundColor: color.fill, borderColor: color.stroke }}
                    aria-hidden
                  />
                  <span className="font-medium">{cand.label}</span>
                </li>
              );
            })}
          </ul>
          <div className="text-xs text-zinc-500 pt-2 border-t mt-3">
            軸の値域は 0〜{scaleMax}。未評価の軸は中心（0）として描画されます。
          </div>
        </div>
      </div>
    </div>
  );
}
