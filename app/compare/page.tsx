import Link from "next/link";
import { Tip } from "@/components/ui/tooltip";
import { PageHeader } from "@/app/_components/PageHeader";
import {
  getConditionsSnapshot,
  getEvalCriteria,
  getEvaluation,
  getSessionMeta,
  listSessions,
  saveSessionMeta,
} from "@/lib/storage";
import type {
  AxisEvaluation,
  ConditionsSnapshot,
  Evaluation,
  SessionMeta,
} from "@/lib/types";
import { CompareTransposed, type TransposedRow } from "./_components/CompareTransposed";
import { RadarChart, type RadarCandidate } from "./_components/RadarChart";
import { rolePillClass } from "@/lib/uiClass";
import { SessionListFilters } from "../_components/SessionListFilters";
import { SessionListTable } from "../_components/SessionListTable";

const TRANSPOSE_THRESHOLD = 7;

type SP = Promise<{
  ids?: string;
  state?: string;
  role?: string;
  result?: string;
  verdict?: string;
  q?: string;
}>;

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


function passingPill(g: Evaluation["合否"] | null | undefined) {
  if (g === "合格") return <span className="pill pill-pass">合格</span>;
  if (g === "不合格") return <span className="pill pill-fail">不合格</span>;
  if (g === "普通") return <span className="pill pill-mid">普通</span>;
  return <span className="text-muted-foreground opacity-70">―</span>;
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
  const { ids: rawIds, state, role, result, verdict, q } = await searchParams;
  const ids = (rawIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // ids 無し → セッション選択画面（/list と同じ filters + table を使い、比較モード）
  if (ids.length < 2) {
    const all = listSessions();
    const filtered = all.filter((s) => {
      if (state && s.status !== state) return false;
      if (role && s.役割 !== role) return false;
      if (result && s.result !== result) return false;
      if (verdict && s.合否 !== verdict) return false;
      if (q && !s.氏名.includes(q)) return false;
      return true;
    });
    const rows = filtered.map((meta) => {
      const hasScore = typeof meta.総合スコア === "number";
      const hasVerdict = meta.合否 != null;
      if (hasScore && hasVerdict) return { meta, score: meta.総合スコア ?? null };
      if (meta.status !== "評価済") return { meta, score: meta.総合スコア ?? null };
      const ev = getEvaluation(meta.id);
      if (!ev) return { meta, score: meta.総合スコア ?? null };
      const patched: typeof meta = {
        ...meta,
        総合スコア: hasScore ? meta.総合スコア : ev.総合スコア,
        合否: hasVerdict ? meta.合否 : ev.合否,
      };
      if (patched.総合スコア !== meta.総合スコア || patched.合否 !== meta.合否) {
        saveSessionMeta(patched);
      }
      return { meta: patched, score: patched.総合スコア ?? null };
    });
    const roleOptions = Array.from(new Set(all.map((s) => s.役割)));

    return (
      <div className="bg-card rounded-xl border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="font-bold text-lg">横断比較</h1>
          <span className="text-xs text-muted-foreground">
            評価済セッションを 2 件以上選んで比較
          </span>
        </div>

        <SessionListFilters
          key={`${state ?? ""}|${role ?? ""}|${result ?? ""}|${verdict ?? ""}|${q ?? ""}`}
          initialState={state}
          initialRole={role}
          initialResult={result}
          initialVerdict={verdict}
          initialQ={q}
          roleOptions={roleOptions}
          basePath="/compare"
          hideStatus
        />

        {filtered.length === 0 ? (
          <div className="border-2 border-dashed rounded-lg p-12 text-center space-y-3">
            <div className="text-muted-foreground opacity-70 text-4xl">🔀</div>
            <div className="text-sm text-muted-foreground">
              {all.length > 0
                ? "条件に合う面談がありません"
                : "まだ面談がありません"}
            </div>
          </div>
        ) : (
          <SessionListTable rows={rows} total={all.length} mode="compare" />
        )}
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
      <div className="bg-card rounded-xl border shadow-sm">
        <PageHeader title="横断比較" />
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
    <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
      <PageHeader
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
        <div className="text-xs text-muted-foreground leading-relaxed">
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
            <thead className="bg-muted text-muted-foreground text-xs">
              <tr>
                <th className="text-left px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-muted z-10 min-w-[140px]">
                  項目
                </th>
                {cols.map((c) => (
                  <th key={c.meta.id} className="text-left px-4 py-2 font-medium min-w-[180px]">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/sessions/${encodeURIComponent(c.meta.id)}`}
                        className="font-semibold text-foreground hover:underline"
                      >
                        {c.meta.氏名}
                      </Link>
                      <span className={rolePillClass(c.meta.役割)}>{c.meta.役割}</span>
                    </div>
                    <div className="text-2xs text-muted-foreground opacity-70 tabular mt-0.5">
                      {c.meta.id}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {/* 総合スコア（Max が出した値） */}
              <tr className="bg-muted/50">
                <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-muted/50">
                  総合スコア
                  <div className="text-2xs text-muted-foreground opacity-70 font-normal">Max 出力</div>
                </td>
                {cols.map((c, i) => {
                  const v = totals[i];
                  const isBest = v != null && v === totalsExt.best && totalsExt.best !== totalsExt.worst;
                  const isWorst = v != null && v === totalsExt.worst && totalsExt.best !== totalsExt.worst;
                  return (
                    <td key={c.meta.id} className="px-4 py-2">
                      {v == null ? (
                        <span className="text-muted-foreground opacity-70">―</span>
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
                <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-blue-50/30">
                  重み付き総合
                  <div className="text-2xs text-muted-foreground opacity-70 font-normal">凍結重みで再計算</div>
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
                        <span className="text-muted-foreground opacity-70">―</span>
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
                                className={`text-2xs tabular ${
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
                <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-card">合否</td>
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
                    <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-card">
                      {axis}
                      {weight != null && (
                        <span className="ml-2 text-2xs text-muted-foreground opacity-70 font-normal tabular">
                          重み {weight}
                        </span>
                      )}
                    </td>
                    {cells.map((cell, i) => {
                      const c = cols[i];
                      if (!cell) {
                        return (
                          <td key={c.meta.id} className="px-4 py-2 text-muted-foreground opacity-70">
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
                            <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden min-w-[60px]">
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
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-3">
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
                <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-card">自己解決レベル</td>
                {cols.map((c, i) => {
                  const v = selfs[i];
                  const isBest = v != null && v === selfsExt.best && selfsExt.best !== selfsExt.worst;
                  const isWorst = v != null && v === selfsExt.worst && selfsExt.best !== selfsExt.worst;
                  return (
                    <td key={c.meta.id} className="px-4 py-2 tabular">
                      {v == null ? (
                        <span className="text-muted-foreground opacity-70">―</span>
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
                          {v} <span className="text-xs text-muted-foreground opacity-70">/ 5</span>
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* 良い点 */}
              <tr className="align-top">
                <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-card">良い点</td>
                {cols.map((c) => (
                  <td key={c.meta.id} className="px-4 py-2 text-xs text-foreground/85 leading-relaxed">
                    {c.evaluation?.良い点 || <span className="text-muted-foreground opacity-70">―</span>}
                  </td>
                ))}
              </tr>

              {/* 懸念点 */}
              <tr className="align-top">
                <td className="px-4 py-2 font-medium sticky left-0 shadow-[2px_0_4px_rgba(0,0,0,0.05)] bg-card">懸念点</td>
                {cols.map((c) => (
                  <td key={c.meta.id} className="px-4 py-2 text-xs text-foreground/85 leading-relaxed">
                    {c.evaluation?.懸念点 || <span className="text-muted-foreground opacity-70">―</span>}
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

