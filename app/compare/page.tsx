import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  getConditionsSnapshot,
  getEvalCriteria,
  getEvaluation,
  getSessionMeta,
} from "@/lib/storage";
import type {
  AxisEvaluation,
  ConditionsSnapshot,
  Evaluation,
  SessionMeta,
} from "@/lib/types";
import { CompareTransposed, type TransposedRow } from "./_components/CompareTransposed";
import { RadarChart, type RadarCandidate } from "./_components/RadarChart";

const TRANSPOSE_THRESHOLD = 7;

type SP = Promise<{ ids?: string }>;

type CompareCol = {
  meta: SessionMeta;
  evaluation: Evaluation | null;
  snapshot: ConditionsSnapshot | null;
  weightedTotal: number | null;
};

/** ConditionsSnapshot の重みと Evaluation の軸スコアから重み付き平均を計算 */
function computeWeightedTotal(
  evaluation: Evaluation | null,
  snapshot: ConditionsSnapshot | null,
): number | null {
  if (!evaluation || !snapshot) return null;
  const axes = snapshot.eval.評価軸;
  if (axes.length === 0) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  let matched = 0;
  for (const axis of axes) {
    const a = evaluation.軸評価.find((x) => x.軸 === axis.名前);
    if (a == null) continue;
    weightedSum += a.スコア * axis.重み;
    totalWeight += axis.重み;
    matched++;
  }
  if (totalWeight === 0 || matched === 0) return null;
  return weightedSum / totalWeight;
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

function passingPill(g: Evaluation["合否"] | null) {
  if (g === "合格") return <span className="pill pill-pass">合格</span>;
  if (g === "不合格") return <span className="pill pill-fail">不合格</span>;
  if (g === "普通") return <span className="pill pill-edit">普通</span>;
  return <span className="text-zinc-400">―</span>;
}

function scoreColor(score: number, pass: number, mid: number): string {
  if (score >= pass) return "text-emerald-700";
  if (score >= mid) return "text-amber-700";
  return "text-red-700";
}

function bestWorst(values: (number | null)[]): { best: number | null; worst: number | null } {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length === 0) return { best: null, worst: null };
  return { best: Math.max(...nums), worst: Math.min(...nums) };
}

function buildAxisMap(cols: CompareCol[]): {
  axes: string[];
  rows: Map<string, (AxisEvaluation | null)[]>;
} {
  const axisSet = new Set<string>();
  for (const c of cols) {
    if (!c.evaluation) continue;
    for (const a of c.evaluation.軸評価) axisSet.add(a.軸);
  }
  const axes = Array.from(axisSet);
  const rows = new Map<string, (AxisEvaluation | null)[]>();
  for (const axis of axes) {
    rows.set(
      axis,
      cols.map((c) => c.evaluation?.軸評価.find((a) => a.軸 === axis) ?? null),
    );
  }
  return { axes, rows };
}

export default async function ComparePage({ searchParams }: { searchParams: SP }) {
  const { ids: rawIds } = await searchParams;
  const ids = (rawIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (ids.length < 2) {
    return (
      <div className="bg-white rounded-xl border shadow-sm">
        <CompareHeader title="横断比較" />
        <div className="p-6 space-y-3">
          <p className="text-sm text-zinc-600">
            比較するには 2 件以上のセッションが必要です。
          </p>
        </div>
      </div>
    );
  }

  const criteria = getEvalCriteria();
  const passLine = criteria?.合格ライン ?? 4.2;
  const midLine = criteria?.普通ライン ?? 3.5;

  const cols: CompareCol[] = ids
    .map((id) => {
      const meta = getSessionMeta(id);
      if (!meta) return null;
      const evaluation = getEvaluation(id);
      const snapshot = getConditionsSnapshot(id);
      return {
        meta,
        evaluation,
        snapshot,
        weightedTotal: computeWeightedTotal(evaluation, snapshot),
      };
    })
    .filter((c): c is CompareCol => c !== null);

  if (cols.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm">
        <CompareHeader title="横断比較" />
        <div className="p-6 space-y-3">
          <p className="text-sm text-red-700">
            指定された ID のセッションが見つかりませんでした。
          </p>
        </div>
      </div>
    );
  }

  const totals = cols.map((c) => c.evaluation?.総合スコア ?? null);
  const totalsExt = bestWorst(totals);
  const weightedTotals = cols.map((c) => c.weightedTotal);
  const weightedExt = bestWorst(weightedTotals);
  const selfs = cols.map((c) => c.evaluation?.自己解決レベル ?? null);
  const selfsExt = bestWorst(selfs);
  const { axes, rows } = buildAxisMap(cols);

  // 重みは軸ごとに表示するため、最初に snapshot を持つ列の評価軸 → 軸名→重み のマップにする
  const axisWeightMap = new Map<string, number>();
  for (const c of cols) {
    if (!c.snapshot) continue;
    for (const ax of c.snapshot.eval.評価軸) {
      if (!axisWeightMap.has(ax.名前)) axisWeightMap.set(ax.名前, ax.重み);
    }
  }

  // レーダーチャート用に評価済の候補者だけを抽出
  const radarCandidates: RadarCandidate[] = cols
    .filter((c) => c.evaluation != null)
    .map((c) => {
      const values = new Map<string, number>();
      for (const a of c.evaluation!.軸評価) {
        values.set(a.軸, a.スコア);
      }
      return { id: c.meta.id, label: c.meta.氏名, values };
    });
  const scaleMax = cols[0]?.snapshot?.eval.スケール.最大 ?? 5;

  const isTransposed = cols.length >= TRANSPOSE_THRESHOLD;

  // 7 件以上：転置ビュー用の行データに変換
  const transposedRows: TransposedRow[] = cols.map((c) => {
    const axisScoreMap: Record<string, number | null> = {};
    const axisRationaleMap: Record<string, string | null> = {};
    for (const ax of axes) {
      const a = c.evaluation?.軸評価.find((x) => x.軸 === ax);
      axisScoreMap[ax] = a?.スコア ?? null;
      axisRationaleMap[ax] = a?.根拠 ?? null;
    }
    return {
      id: c.meta.id,
      name: c.meta.氏名,
      role: c.meta.役割,
      total: c.evaluation?.総合スコア ?? null,
      weighted: c.weightedTotal,
      self: c.evaluation?.自己解決レベル ?? null,
      pass: c.evaluation?.合否 ?? null,
      axes: axisScoreMap,
      axisRationale: axisRationaleMap,
      good: c.evaluation?.良い点 ?? null,
      concern: c.evaluation?.懸念点 ?? null,
    };
  });
  const axisWeightRecord: Record<string, number> = {};
  for (const [k, v] of axisWeightMap) axisWeightRecord[k] = v;

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <CompareHeader
        title="横断比較"
        count={cols.length}
        suffix={
          isTransposed ? (
            <span className="pill pill-eval text-2xs">転置ビュー</span>
          ) : null
        }
      />


      <div className="p-6 space-y-6">
        {isTransposed ? (
          <CompareTransposed
            rows={transposedRows}
            axes={axes}
            axisWeights={axisWeightRecord}
            passLine={passLine}
            midLine={midLine}
          />
        ) : (
          <>
        <div className="text-xs text-zinc-500 leading-relaxed">
          評価軸ごとに最高値を <span className="text-emerald-700 font-medium">緑</span>、
          最低値を <span className="text-red-700 font-medium">赤</span> でハイライト。
          合格ライン {passLine} / 普通ライン {midLine}。未評価のセッションは空欄表示。
          <br />
          <strong>重み付き総合</strong>は、各セッションが ④ で凍結した時点の重みで再計算した値。
          Max 出力との差が 0.1 以上なら隣に差分（<span className="text-emerald-600">+</span> /{" "}
          <span className="text-red-600">−</span>）を表示します（Max が重みを無視した可能性のチェック用）。
        </div>

        <RadarChart axes={axes} candidates={radarCandidates} scaleMax={scaleMax} />


        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-zinc-600 text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium sticky left-0 bg-zinc-50 z-10 min-w-[140px]">
                  項目
                </th>
                {cols.map((c) => (
                  <th key={c.meta.id} className="text-left px-4 py-2 font-medium min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sessions/${encodeURIComponent(c.meta.id)}`}
                        className="font-semibold text-zinc-800 hover:underline"
                      >
                        {c.meta.氏名}
                      </Link>
                      <span className={rolePillClass(c.meta.役割)}>{c.meta.役割}</span>
                    </div>
                    <div className="text-[10px] text-zinc-400 tabular mt-0.5">
                      {c.meta.id}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* 総合スコア（Max が出した値） */}
              <tr className="bg-zinc-50/50">
                <td className="px-4 py-2 font-medium sticky left-0 bg-zinc-50/50">
                  総合スコア
                  <div className="text-[10px] text-zinc-400 font-normal">Max 出力</div>
                </td>
                {cols.map((c, i) => {
                  const v = totals[i];
                  const isBest = v != null && v === totalsExt.best && totalsExt.best !== totalsExt.worst;
                  const isWorst = v != null && v === totalsExt.worst && totalsExt.best !== totalsExt.worst;
                  return (
                    <td key={c.meta.id} className="px-4 py-2">
                      {v == null ? (
                        <span className="text-zinc-400">―</span>
                      ) : (
                        <span
                          className={`text-2xl font-bold tabular ${
                            isBest
                              ? "text-emerald-700"
                              : isWorst
                                ? "text-red-700"
                                : scoreColor(v, passLine, midLine)
                          }`}
                        >
                          {v.toFixed(1)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* 重み付き総合スコア（再計算） */}
              <tr className="bg-blue-50/30">
                <td className="px-4 py-2 font-medium sticky left-0 bg-blue-50/30">
                  重み付き総合
                  <div className="text-[10px] text-zinc-400 font-normal">凍結重みで再計算</div>
                </td>
                {cols.map((c, i) => {
                  const v = weightedTotals[i];
                  const stored = totals[i];
                  const isBest = v != null && v === weightedExt.best && weightedExt.best !== weightedExt.worst;
                  const isWorst = v != null && v === weightedExt.worst && weightedExt.best !== weightedExt.worst;
                  const delta = v != null && stored != null ? v - stored : null;
                  const driftSignificant = delta != null && Math.abs(delta) >= 0.1;
                  return (
                    <td key={c.meta.id} className="px-4 py-2">
                      {v == null ? (
                        <span className="text-zinc-400">―</span>
                      ) : (
                        <div className="flex items-baseline gap-2">
                          <span
                            className={`text-xl font-semibold tabular ${
                              isBest
                                ? "text-emerald-700"
                                : isWorst
                                  ? "text-red-700"
                                  : scoreColor(v, passLine, midLine)
                            }`}
                          >
                            {v.toFixed(2)}
                          </span>
                          {driftSignificant && delta != null && (
                            <Tip content="Max が出した総合スコアと、凍結重みでの再計算値の差。0.1 以上で表示。Max が重みを無視した可能性あり。">
                              <span
                                className={`text-[10px] tabular ${
                                  delta > 0 ? "text-emerald-600" : "text-red-600"
                                }`}
                              >
                                {delta > 0 ? "+" : ""}
                                {delta.toFixed(2)}
                              </span>
                            </Tip>
                          )}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* 合否 */}
              <tr>
                <td className="px-4 py-2 font-medium sticky left-0 bg-white">合否</td>
                {cols.map((c) => (
                  <td key={c.meta.id} className="px-4 py-2">
                    {passingPill(c.evaluation?.合否 ?? null)}
                  </td>
                ))}
              </tr>

              {/* 軸評価 */}
              {axes.map((axis) => {
                const cells = rows.get(axis) ?? [];
                const values = cells.map((c) => c?.スコア ?? null);
                const ext = bestWorst(values);
                const weight = axisWeightMap.get(axis);
                return (
                  <tr key={axis}>
                    <td className="px-4 py-2 font-medium sticky left-0 bg-white">
                      {axis}
                      {weight != null && (
                        <span className="ml-2 text-[10px] text-zinc-400 font-normal tabular">
                          重み {weight}
                        </span>
                      )}
                    </td>
                    {cells.map((cell, i) => {
                      const c = cols[i];
                      if (!cell) {
                        return (
                          <td key={c.meta.id} className="px-4 py-2 text-zinc-400">
                            ―
                          </td>
                        );
                      }
                      const v = cell.スコア;
                      const isBest = v === ext.best && ext.best !== ext.worst;
                      const isWorst = v === ext.worst && ext.best !== ext.worst;
                      return (
                        <td key={c.meta.id} className="px-4 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-base font-semibold tabular ${
                                isBest
                                  ? "text-emerald-700"
                                  : isWorst
                                    ? "text-red-700"
                                    : scoreColor(v, passLine, midLine)
                              }`}
                            >
                              {v.toFixed(1)}
                            </span>
                            <div className="flex-1 h-1.5 bg-zinc-100 rounded overflow-hidden min-w-[60px]">
                              <div
                                className={`h-full ${
                                  isBest
                                    ? "bg-emerald-500"
                                    : isWorst
                                      ? "bg-red-400"
                                      : v >= passLine
                                        ? "bg-emerald-400"
                                        : v >= midLine
                                          ? "bg-amber-400"
                                          : "bg-red-300"
                                }`}
                                style={{ width: `${Math.min(100, (v / 5) * 100)}%` }}
                              />
                            </div>
                          </div>
                          {cell.根拠 && (
                            <div className="text-[11px] text-zinc-500 mt-1 line-clamp-3">
                              {cell.根拠}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* 自己解決レベル */}
              <tr>
                <td className="px-4 py-2 font-medium sticky left-0 bg-white">自己解決レベル</td>
                {cols.map((c, i) => {
                  const v = selfs[i];
                  const isBest = v != null && v === selfsExt.best && selfsExt.best !== selfsExt.worst;
                  const isWorst = v != null && v === selfsExt.worst && selfsExt.best !== selfsExt.worst;
                  return (
                    <td key={c.meta.id} className="px-4 py-2 tabular">
                      {v == null ? (
                        <span className="text-zinc-400">―</span>
                      ) : (
                        <span
                          className={
                            isBest
                              ? "text-emerald-700 font-semibold"
                              : isWorst
                                ? "text-red-700 font-semibold"
                                : ""
                          }
                        >
                          {v} <span className="text-xs text-zinc-400">/ 5</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* 良い点 */}
              <tr className="align-top">
                <td className="px-4 py-2 font-medium sticky left-0 bg-white">良い点</td>
                {cols.map((c) => (
                  <td key={c.meta.id} className="px-4 py-2 text-xs text-zinc-700 leading-relaxed">
                    {c.evaluation?.良い点 || <span className="text-zinc-400">―</span>}
                  </td>
                ))}
              </tr>

              {/* 懸念点 */}
              <tr className="align-top">
                <td className="px-4 py-2 font-medium sticky left-0 bg-white">懸念点</td>
                {cols.map((c) => (
                  <td key={c.meta.id} className="px-4 py-2 text-xs text-zinc-700 leading-relaxed">
                    {c.evaluation?.懸念点 || <span className="text-zinc-400">―</span>}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
          </>
        )}
      </div>
    </div>
  );
}

function CompareHeader({
  title,
  count,
  suffix,
}: {
  title: string;
  count?: number;
  suffix?: React.ReactNode;
}) {
  return (
    <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
      <Tip content="一覧へ戻る">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="group h-8 pl-2 pr-3 gap-1.5 rounded-full text-xs font-medium text-zinc-500 hover:text-blue-600 hover:bg-blue-50"
        >
          <Link href="/" aria-label="一覧へ戻る">
            <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            一覧
          </Link>
        </Button>
      </Tip>
      <div className="h-5 w-px bg-zinc-200" aria-hidden="true" />
      <div className="font-bold whitespace-nowrap">{title}</div>
      {count != null && (
        <span className="text-xs text-zinc-500">{count} 件</span>
      )}
      {suffix}
    </header>
  );
}
