import {
  aggregateBy,
  aggregateByDay,
  aggregateTotal,
  estimateModelSetCost,
  loadCostRecords,
  type Aggregate,
  type DailyPoint,
  type ModelEstimate,
  type Stage,
} from "@/lib/costEstimate";
import {
  CHARS_PER_TOKEN,
  MODEL_PRICING,
  USD_TO_JPY,
  fmtJpy,
  fmtUsd,
  isPricingKnown,
} from "@/lib/pricing";
import { PROVIDERS, TIER_ICON, TIER_LABEL, type Tier } from "@/lib/llm/registry";
import {
  RecentCallsFilter,
  type RecentRow,
} from "./_components/RecentCallsFilter";

export const dynamic = "force-dynamic";

const STAGE_ORDER: Stage[] = ["①要約", "③生成", "③整形", "④面談内容", "⑤評価"];

/** UI 上で「想定単価」の対象にする Claude モデル ID の順序（速い→高精度） */
const CLAUDE_MODEL_ORDER = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];

/** claude-haiku-4-5-20251001 → Haiku 4.5 等の短縮表示 */
function shortModelLabel(id: string): string {
  const info = Object.values(PROVIDERS)
    .flatMap((p) => p.models)
    .find((m) => m.id === id);
  return info?.label ?? id;
}

function tierOf(id: string): Tier | null {
  const info = Object.values(PROVIDERS)
    .flatMap((p) => p.models)
    .find((m) => m.id === id);
  return info?.tier ?? null;
}

export default async function CostPage() {
  const records = loadCostRecords(5000);
  const total = aggregateTotal(records);

  if (records.length === 0) {
    return (
      <div className="space-y-4">
        <PricingPreviewCard />
        <div className="bg-card rounded-xl border shadow-sm">
          <div className="p-6 space-y-3">
            <h1 className="font-bold text-lg">コスト実績</h1>
            <div className="text-sm text-muted-foreground leading-relaxed">
              LLM API 呼び出しの記録がまだありません。
              <br />
              ①要約 / ③生成 / ④面談内容 / ⑤評価 を「API モード」で実行すると、
              ここに概算コストが集計されます。
            </div>
          </div>
        </div>
      </div>
    );
  }

  const byMonth = aggregateBy(records, (r) => r.yyyymm);
  const byModel = aggregateBy(records, (r) => r.model);
  const byStage = aggregateBy(records, (r) => r.stage);
  const daily = aggregateByDay(records, 30);

  // 前月比（当月と直前月の比較）
  const monthDelta =
    byMonth.length >= 2
      ? (byMonth[byMonth.length - 1].agg.totalJpy /
          Math.max(byMonth[byMonth.length - 2].agg.totalJpy, 0.01) -
          1) *
        100
      : null;

  // 1 面談あたり平均（unique sessionId 数で割る）
  const uniqueSessions = new Set(
    records.map((r) => r.sessionId).filter((v): v is string => !!v),
  ).size;
  const perSessionJpy = uniqueSessions > 0 ? total.totalJpy / uniqueSessions : 0;

  // 最頻工程
  const topStage =
    byStage.length > 0
      ? [...byStage].sort((a, b) => b.agg.count - a.agg.count)[0]
      : null;

  // 想定単価: Claude 3 モデル分
  const modelEstimates: ModelEstimate[] = CLAUDE_MODEL_ORDER.map((id) =>
    estimateModelSetCost(id, records),
  );

  const unknownModels = Array.from(
    new Set(records.filter((r) => !isPricingKnown(r.model)).map((r) => r.model)),
  );

  const recentRows: RecentRow[] = records.slice(0, 200).map((r) => ({
    ts: r.ts,
    stage: r.stage,
    provider: r.provider,
    model: r.model,
    inputTokens: r.cost.inputTokens,
    outputTokens: r.cost.outputTokens,
    jpy: r.cost.totalJpy,
  }));

  return (
    <div className="space-y-4">
      {/* ═══ ヘッダ + KPI ═══ */}
      <div className="bg-card rounded-xl border shadow-sm">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-bold text-lg">コスト試算</h1>
            <span className="text-xs text-muted-foreground">
              {records.length} 件の呼び出し ・ 直近 5000 件まで
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              label="累計"
              value={fmtJpy(total.totalJpy)}
              sub={
                monthDelta === null
                  ? fmtUsd(total.totalUsd)
                  : `${monthDelta >= 0 ? "▲" : "▼"} ${Math.abs(monthDelta).toFixed(0)}% 前月比 ・ ${fmtUsd(total.totalUsd)}`
              }
              subTone={
                monthDelta === null
                  ? "muted"
                  : monthDelta >= 0
                    ? "up"
                    : "down"
              }
            />
            <KpiCard
              label="呼び出し回数"
              value={total.count.toString()}
              suffix="回"
              sub={topStage ? `最頻: ${topStage.key} (${topStage.agg.count} 回)` : undefined}
            />
            <KpiCard
              label="1 面談あたり平均"
              value={uniqueSessions > 0 ? fmtJpy(perSessionJpy) : "—"}
              sub={
                uniqueSessions > 0
                  ? `${uniqueSessions} 面談分の実績から算出`
                  : "セッションが記録されていません"
              }
            />
            <KpiCard
              label="累計トークン（推定）"
              value={(total.inputTokens + total.outputTokens).toLocaleString()}
              sub={`入 ${total.inputTokens.toLocaleString()} / 出 ${total.outputTokens.toLocaleString()}`}
            />
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
            ⚠️ <span className="font-medium">あくまで概算</span>です。文字数 ÷{" "}
            {CHARS_PER_TOKEN}
            ≈ token で換算しているため、英数比率や全角・半角の混在で誤差が出ます。
            為替は USD ¥{USD_TO_JPY} 固定。実額は Anthropic Console / 請求書をご確認ください。
          </div>

          {unknownModels.length > 0 && (
            <div className="text-xs border border-amber-200 bg-amber-50 text-amber-800 rounded px-3 py-2">
              単価表に無いモデル（コスト 0 として集計）:{" "}
              <span className="font-mono">{unknownModels.join(", ")}</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══ モデル別 想定単価（NEW） ═══ */}
      <PricingCards estimates={modelEstimates} />

      {/* ═══ 日次コスト推移（SVG） ═══ */}
      <DailyChartSection points={daily} />

      {/* ═══ モデル別 + 工程別（2 カラム） ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="モデル別（実績）">
          <CostTable
            rows={byModel.map(({ key, agg }) => ({
              label: shortModelLabel(key),
              subLabel: key,
              agg,
              note: isPricingKnown(key) ? undefined : "単価未登録",
            }))}
            headLabel="モデル"
          />
        </Section>
        <Section title="工程別（実績）">
          <CostTable
            rows={STAGE_ORDER.filter((s) => byStage.some((b) => b.key === s)).map(
              (s) => ({
                label: s,
                agg: byStage.find((b) => b.key === s)!.agg,
              }),
            )}
            headLabel="工程"
          />
        </Section>
      </div>

      {/* ═══ 月別 ═══ */}
      <Section title={`月別（${byMonth.length} ヶ月分）`} hint="audit.log の ts 基準">
        <MonthlyBars months={byMonth} />
      </Section>

      {/* ═══ 直近呼び出し（フィルタ付） ═══ */}
      <Section title={`直近呼び出し（最新 ${recentRows.length} 件）`}>
        <RecentCallsFilter rows={recentRows} />
      </Section>
    </div>
  );
}

/* ─────────────────────────────────────── 部品 ─────────────────────────────────────── */

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <h3 className="font-bold">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  suffix,
  sub,
  subTone = "muted",
}: {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
  subTone?: "muted" | "up" | "down";
}) {
  const subCls =
    subTone === "up"
      ? "text-rose-600"
      : subTone === "down"
        ? "text-emerald-600"
        : "text-muted-foreground";
  return (
    <div className="border rounded-lg px-3 py-2 bg-card shadow-sm">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">
        {value}
        {suffix && (
          <span className="text-sm font-normal text-muted-foreground ml-1">
            {suffix}
          </span>
        )}
      </div>
      {sub && <div className={`text-xs mt-0.5 ${subCls}`}>{sub}</div>}
    </div>
  );
}

/* ─── 想定単価カード ─── */

function PricingCards({ estimates }: { estimates: ModelEstimate[] }) {
  // 3 モデルの合計を集めて比較バーの最大値にする
  const maxJpy = Math.max(...estimates.map((e) => e.setCost.totalJpy), 0.01);

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap">
        <h3 className="font-bold">モデル別 想定単価</h3>
        <span className="pill bg-amber-100 text-amber-900 text-2xs">NEW</span>
        <span className="text-xs text-muted-foreground">
          1 面談セット（①③④⑤）を通したときの目安 ・ 実データ中央値がなければ既定見積
        </span>
      </div>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {estimates.map((est) => (
            <PricingCard key={est.model} est={est} />
          ))}
        </div>

        {/* 比較バー */}
        <div className="border-t pt-3 space-y-1.5">
          <div className="text-xs text-muted-foreground mb-1">
            1 面談セット合計コスト比較
          </div>
          {estimates.map((est) => {
            const w = (est.setCost.totalJpy / maxJpy) * 100;
            return (
              <div key={est.model} className="flex items-center gap-2 text-sm">
                <div className="w-28 font-mono text-xs">
                  {shortModelLabel(est.model)}
                </div>
                <div className="flex-1 bg-muted rounded h-6 relative overflow-hidden">
                  <div
                    className={`h-6 rounded ${barBgOf(est.model)}`}
                    style={{ width: `${w}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                    {fmtJpy(est.setCost.totalJpy)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 工程別内訳 (折り畳み) */}
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-xs text-primary hover:underline">
            工程別内訳を展開
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-2 py-1">モデル</th>
                  <th className="text-right px-2 py-1">①要約</th>
                  <th className="text-right px-2 py-1">③生成</th>
                  <th className="text-right px-2 py-1">④面談内容</th>
                  <th className="text-right px-2 py-1">⑤評価</th>
                  <th className="text-right px-2 py-1 font-bold">合計</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {estimates.map((est) => (
                  <tr key={est.model}>
                    <td className="px-2 py-1.5 font-mono text-xs">
                      {shortModelLabel(est.model)}
                    </td>
                    {est.stages.map((s) => (
                      <td key={s.stage} className="text-right tabular-nums px-2 py-1.5">
                        {fmtJpy(s.cost.totalJpy)}{" "}
                        <span
                          className={`text-2xs ${
                            s.source === "real" ? "text-emerald-600" : "text-amber-600"
                          }`}
                          title={
                            s.source === "real"
                              ? `このモデルの実データ ${s.sampleCount} 件の中央値`
                              : "既定見積または他モデル実績を借用"
                          }
                        >
                          {s.source === "real" ? "実" : "見"}
                        </span>
                      </td>
                    ))}
                    <td className="text-right tabular-nums font-bold px-2 py-1.5">
                      {fmtJpy(est.setCost.totalJpy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-2xs text-muted-foreground mt-2 flex flex-wrap gap-3">
              <span>
                <span className="text-emerald-600 font-bold">実</span> =
                このプロジェクトの実データ中央値
              </span>
              <span>
                <span className="text-amber-600 font-bold">見</span> = 既定見積
              </span>
              <span>単価は 2026-07 時点</span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

function PricingCard({ est }: { est: ModelEstimate }) {
  const tier = tierOf(est.model);
  const pricing = MODEL_PRICING[est.model];
  const bg = cardBgOf(est.model);
  return (
    <div className={`border rounded-lg p-3 ${bg}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="font-mono text-xs font-bold">
          {shortModelLabel(est.model)}
        </span>
        {tier && (
          <span className={`pill text-2xs ${tierPillCls(tier)}`}>
            {TIER_ICON[tier]} {TIER_LABEL[tier]}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold">
        {fmtJpy(est.setCost.totalJpy)}
        <span className="text-xs font-normal text-muted-foreground ml-1">
          / 面談
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        {pricing
          ? `入 $${pricing.inputUsdPerMTok} / 出 $${pricing.outputUsdPerMTok} per M tok`
          : "単価未登録"}
      </div>
    </div>
  );
}

function cardBgOf(model: string): string {
  if (model.includes("haiku")) return "bg-blue-50/40 border-blue-200";
  if (model.includes("sonnet")) return "bg-indigo-50/40 border-indigo-200";
  if (model.includes("opus")) return "bg-pink-50/40 border-pink-200";
  return "";
}

function barBgOf(model: string): string {
  if (model.includes("haiku")) return "bg-blue-400";
  if (model.includes("sonnet")) return "bg-indigo-400";
  if (model.includes("opus")) return "bg-pink-400";
  return "bg-primary/40";
}

function tierPillCls(tier: Tier): string {
  if (tier === "fast") return "bg-blue-100 text-blue-900";
  if (tier === "balanced") return "bg-indigo-100 text-indigo-900";
  return "bg-pink-100 text-pink-900";
}

/* ─── 日次推移 SVG ─── */

function DailyChartSection({ points }: { points: DailyPoint[] }) {
  const max = Math.max(...points.map((p) => p.totalJpy), 0.01);
  const total = points.reduce((a, b) => a + b.totalJpy, 0);
  const busiest = [...points]
    .filter((p) => p.count > 0)
    .sort((a, b) => b.totalJpy - a.totalJpy)[0];

  const W = 800;
  const H = 180;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xOf = (i: number) =>
    padL + (points.length <= 1 ? 0 : (i / (points.length - 1)) * innerW);
  const yOf = (jpy: number) => padT + innerH - (jpy / max) * innerH;

  const pathLine = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${xOf(i)} ${yOf(p.totalJpy)}`)
    .join(" ");
  const pathArea = `${pathLine} L ${xOf(points.length - 1)} ${padT + innerH} L ${xOf(0)} ${padT + innerH} Z`;

  const firstDate = points[0]?.date ?? "";
  const midDate = points[Math.floor(points.length / 2)]?.date ?? "";
  const lastDate = points[points.length - 1]?.date ?? "";

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-center gap-3 flex-wrap">
        <h3 className="font-bold">日次コスト推移</h3>
        <span className="text-xs text-muted-foreground">
          直近 30 日 ・ 合計 {fmtJpy(total)}
        </span>
        {busiest && (
          <span className="text-xs text-muted-foreground ml-auto">
            最高: {busiest.date} ・ {fmtJpy(busiest.totalJpy)}
          </span>
        )}
      </div>
      <div className="p-4">
        {total === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            直近 30 日の記録がありません
          </div>
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-40">
            <defs>
              <linearGradient id="costGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grid */}
            <line x1={padL} y1={padT} x2={W - padR} y2={padT} stroke="#f4f4f5" />
            <line
              x1={padL}
              y1={padT + innerH / 2}
              x2={W - padR}
              y2={padT + innerH / 2}
              stroke="#f4f4f5"
            />
            <line
              x1={padL}
              y1={padT + innerH}
              x2={W - padR}
              y2={padT + innerH}
              stroke="#e4e4e7"
            />
            <text x={4} y={padT + 4} fontSize="10" fill="#a1a1aa">
              {fmtJpy(max)}
            </text>
            <text x={4} y={padT + innerH / 2 + 4} fontSize="10" fill="#a1a1aa">
              {fmtJpy(max / 2)}
            </text>
            <text x={4} y={padT + innerH + 4} fontSize="10" fill="#a1a1aa">
              ¥0
            </text>
            {/* Area + line */}
            <path d={pathArea} fill="url(#costGrad)" />
            <path d={pathLine} fill="none" stroke="#2563eb" strokeWidth={2} />
            {/* X labels */}
            <text x={padL} y={H - 6} fontSize="10" fill="#a1a1aa">
              {firstDate.slice(5)}
            </text>
            <text
              x={padL + innerW / 2}
              y={H - 6}
              fontSize="10"
              fill="#a1a1aa"
              textAnchor="middle"
            >
              {midDate.slice(5)}
            </text>
            <text x={W - padR} y={H - 6} fontSize="10" fill="#a1a1aa" textAnchor="end">
              {lastDate.slice(5)}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}

/* ─── 月別 横バー ─── */

function MonthlyBars({
  months,
}: {
  months: { key: string; agg: Aggregate }[];
}) {
  const max = Math.max(...months.map((m) => m.agg.totalJpy), 0.01);
  return (
    <div className="space-y-2">
      {months.map(({ key, agg }) => {
        const w = (agg.totalJpy / max) * 100;
        return (
          <div key={key} className="flex items-center gap-3">
            <div className="w-20 text-sm tabular-nums">{key}</div>
            <div className="flex-1 bg-muted rounded h-6 relative overflow-hidden">
              <div
                className="bg-primary/40 h-6 rounded"
                style={{ width: `${w}%` }}
              />
              <div className="absolute inset-0 flex items-center px-2 text-xs">
                {fmtJpy(agg.totalJpy)} ・ {agg.count} 回 ・{" "}
                <span className="text-muted-foreground ml-1">
                  入 {agg.inputTokens.toLocaleString()} / 出{" "}
                  {agg.outputTokens.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── 実績集計テーブル（モデル別 / 工程別 共用） ─── */

function CostTable({
  rows,
  headLabel,
}: {
  rows: { label: string; subLabel?: string; agg: Aggregate; note?: string }[];
  headLabel: string;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-muted-foreground border-b">
        <tr>
          <th className="text-left px-2 py-1">{headLabel}</th>
          <th className="text-right px-2 py-1 w-14">回数</th>
          <th className="text-right px-2 py-1 w-20">JPY</th>
          <th className="text-right px-2 py-1 w-20">1回あたり</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => {
          const avgJpy = r.agg.count > 0 ? r.agg.totalJpy / r.agg.count : 0;
          return (
            <tr key={i}>
              <td className="px-2 py-1.5">
                <div>{r.label}</div>
                {r.subLabel && (
                  <div className="text-2xs text-muted-foreground font-mono">
                    {r.subLabel}
                  </div>
                )}
                {r.note && (
                  <span className="ml-2 text-2xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                    {r.note}
                  </span>
                )}
              </td>
              <td className="text-right tabular-nums">{r.agg.count}</td>
              <td className="text-right tabular-nums font-medium">
                {fmtJpy(r.agg.totalJpy)}
              </td>
              <td className="text-right tabular-nums text-muted-foreground">
                {fmtJpy(avgJpy)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/* ─── 記録ゼロ時の想定単価プレビュー ─── */

function PricingPreviewCard() {
  // ゼロ記録時：実データが無いので全て fallback で見せる
  const ests = CLAUDE_MODEL_ORDER.map((id) => estimateModelSetCost(id, []));
  return <PricingCards estimates={ests} />;
}
