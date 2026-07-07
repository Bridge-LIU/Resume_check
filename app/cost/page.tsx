import { notFound } from "next/navigation";
import { PageHeader } from "@/app/_components/PageHeader";
import {
  aggregateBy,
  aggregateTotal,
  loadCostRecords,
  type Aggregate,
  type CostRecord,
  type Stage,
} from "@/lib/costEstimate";
import { CHARS_PER_TOKEN, USD_TO_JPY, fmtJpy, fmtUsd, isPricingKnown } from "@/lib/pricing";
import { PROVIDERS } from "@/lib/llm/registry";
import { isFullEdition } from "@/lib/edition";
import type { ProviderId } from "@/lib/types";

export const dynamic = "force-dynamic";

const STAGE_ORDER: Stage[] = ["②要約", "⑤生成", "⑤整形", "⑥議事録", "⑧評価"];

function providerLabel(id: ProviderId): string {
  return PROVIDERS[id]?.displayName ?? id;
}

function providerIcon(id: ProviderId): string {
  return PROVIDERS[id]?.icon ?? "•";
}

export default async function CostPage() {
  // 貼付版（EDITION=lite）では API コストは発生しないため /cost 自体を隠す
  if (!isFullEdition()) notFound();
  const records = loadCostRecords(5000);
  const total = aggregateTotal(records);

  if (records.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm">
        <PageHeader title="コスト試算" />
        <div className="p-6 space-y-3">
          <div className="text-sm text-zinc-500 leading-relaxed">
            LLM API 呼び出しの記録がまだありません。
            <br />
            ②要約 / ⑤生成 / ⑥議事録 / ⑧評価 を「API モード」で実行すると、
            ここに概算コストが集計されます。
          </div>
        </div>
      </div>
    );
  }

  const byMonth = aggregateBy(records, (r) => r.yyyymm);
  const byProvider = aggregateBy(records, (r) => r.provider);
  const byModel = aggregateBy(records, (r) => r.model);
  const byStage = aggregateBy(records, (r) => r.stage);

  // 未知モデル（pricing 表に無い）の警告用
  const unknownModels = Array.from(
    new Set(records.filter((r) => !isPricingKnown(r.model)).map((r) => r.model)),
  );

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm">
        <PageHeader
          title="コスト試算"
          meta={`${records.length} 件の呼び出し ・ 直近 5000 件まで`}
        />

        <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard label="累計" value={fmtJpy(total.totalJpy)} sub={fmtUsd(total.totalUsd)} />
          <KpiCard label="呼び出し回数" value={total.count.toString()} suffix="回" />
          <KpiCard
            label="累計トークン（推定）"
            value={(total.inputTokens + total.outputTokens).toLocaleString()}
            sub={`入 ${total.inputTokens.toLocaleString()} / 出 ${total.outputTokens.toLocaleString()}`}
          />
          <KpiCard
            label="1回あたり平均"
            value={fmtJpy(total.count > 0 ? total.totalJpy / total.count : 0)}
            sub={`月平均 ${fmtJpy(byMonth.length > 0 ? total.totalJpy / byMonth.length : 0)} / ${byMonth.length} ヶ月分`}
          />
        </div>

        <div className="px-6 pb-4 text-xs text-zinc-500 leading-relaxed border-t pt-3">
          ⚠️ <span className="font-medium">あくまで概算</span>です。文字数 ÷ {CHARS_PER_TOKEN}
          ≈ token で換算しているため、英数比率や全角・半角の混在で誤差が出ます。
          為替は USD ¥{USD_TO_JPY} 固定。実額は各プロバイダの Console / 請求書をご確認ください。
        </div>

        {unknownModels.length > 0 && (
          <div className="px-6 pb-4">
            <div className="text-xs border border-amber-200 bg-amber-50 text-amber-800 rounded px-3 py-2">
              単価表に無いモデル（コスト 0 として集計）:{" "}
              <span className="font-mono">{unknownModels.join(", ")}</span>
            </div>
          </div>
        )}
      </div>

      {/* 月別 */}
      <Section title={`月別（${byMonth.length} ヶ月分）`} hint="audit.log の ts 基準">
        <CostTable
          rows={byMonth.map(({ key, agg }) => ({ label: key, agg }))}
          headLabel="月"
        />
      </Section>

      {/* プロバイダ別 */}
      <Section title="プロバイダ別">
        <CostTable
          rows={byProvider.map(({ key, agg }) => ({
            label: `${providerIcon(key as ProviderId)} ${providerLabel(key as ProviderId)}`,
            agg,
          }))}
          headLabel="プロバイダ"
        />
      </Section>

      {/* モデル別 */}
      <Section title="モデル別">
        <CostTable
          rows={byModel.map(({ key, agg }) => ({
            label: key,
            agg,
            note: isPricingKnown(key) ? undefined : "単価未登録",
          }))}
          headLabel="モデル"
          monoLabel
        />
      </Section>

      {/* 工程別 */}
      <Section title="工程別">
        <CostTable
          rows={STAGE_ORDER.filter((s) => byStage.some((b) => b.key === s)).map((s) => ({
            label: s,
            agg: byStage.find((b) => b.key === s)!.agg,
          }))}
          headLabel="工程"
        />
      </Section>

      {/* 直近呼び出し */}
      <Section title={`直近呼び出し（最新 ${Math.min(50, records.length)} 件）`}>
        <RecentTable records={records.slice(0, 50)} />
      </Section>
    </div>
  );
}

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
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="px-6 py-3 border-b flex items-center gap-3">
        <h3 className="font-bold">{title}</h3>
        {hint && <span className="text-xs text-zinc-500">{hint}</span>}
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
}: {
  label: string;
  value: string;
  suffix?: string;
  sub?: string;
}) {
  return (
    <div className="border rounded-lg px-3 py-2 bg-zinc-50">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-bold">
        {value}
        {suffix && <span className="text-sm font-normal text-zinc-500 ml-1">{suffix}</span>}
      </div>
      {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function CostTable({
  rows,
  headLabel,
  monoLabel,
}: {
  rows: { label: string; agg: Aggregate; note?: string }[];
  headLabel: string;
  monoLabel?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-zinc-500 border-b">
        <tr>
          <th className="text-left px-2 py-1">{headLabel}</th>
          <th className="text-right px-2 py-1 w-16">回数</th>
          <th className="text-right px-2 py-1 w-28">入力 tok</th>
          <th className="text-right px-2 py-1 w-28">出力 tok</th>
          <th className="text-right px-2 py-1 w-24">USD</th>
          <th className="text-right px-2 py-1 w-24">JPY</th>
          <th className="text-right px-2 py-1 w-24">1回あたり</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {rows.map((r, i) => {
          const avgJpy = r.agg.count > 0 ? r.agg.totalJpy / r.agg.count : 0;
          return (
            <tr key={i}>
              <td className={`px-2 py-1.5 ${monoLabel ? "font-mono text-[12px]" : ""}`}>
                {r.label}
                {r.note && (
                  <span className="ml-2 text-2xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">
                    {r.note}
                  </span>
                )}
              </td>
              <td className="text-right tabular-nums">{r.agg.count}</td>
              <td className="text-right tabular-nums text-zinc-600">
                {r.agg.inputTokens.toLocaleString()}
              </td>
              <td className="text-right tabular-nums text-zinc-600">
                {r.agg.outputTokens.toLocaleString()}
              </td>
              <td className="text-right tabular-nums">{fmtUsd(r.agg.totalUsd)}</td>
              <td className="text-right tabular-nums font-medium">{fmtJpy(r.agg.totalJpy)}</td>
              <td className="text-right tabular-nums text-zinc-600">{fmtJpy(avgJpy)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}


function RecentTable({ records }: { records: CostRecord[] }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-xs text-zinc-500 border-b">
        <tr>
          <th className="text-left px-2 py-1 w-36">日時</th>
          <th className="text-left px-2 py-1 w-20">工程</th>
          <th className="text-left px-2 py-1 w-32">プロバイダ</th>
          <th className="text-left px-2 py-1">モデル</th>
          <th className="text-right px-2 py-1 w-24">入 tok</th>
          <th className="text-right px-2 py-1 w-24">出 tok</th>
          <th className="text-right px-2 py-1 w-24">JPY</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {records.map((r, i) => (
          <tr key={i}>
            <td className="px-2 py-1 text-xs tabular-nums text-zinc-600">
              {r.ts.replace("T", " ").slice(0, 16)}
            </td>
            <td className="px-2 py-1">{r.stage}</td>
            <td className="px-2 py-1 text-[12px]">
              {providerIcon(r.provider)} {providerLabel(r.provider)}
            </td>
            <td className="px-2 py-1 font-mono text-xs">{r.model}</td>
            <td className="text-right tabular-nums text-zinc-600">
              {r.cost.inputTokens.toLocaleString()}
            </td>
            <td className="text-right tabular-nums text-zinc-600">
              {r.cost.outputTokens.toLocaleString()}
            </td>
            <td className="text-right tabular-nums font-medium">{fmtJpy(r.cost.totalJpy)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
