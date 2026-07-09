"use client";

import { useMemo, useState } from "react";
import { fmtJpy } from "@/lib/pricing";
import { PROVIDERS } from "@/lib/llm/registry";
import type { ProviderId } from "@/lib/types";

/**
 * 直近呼び出しをフィルタ・折り畳み表示するクライアントコンポーネント。
 * server 側で CostRecord をそのまま渡す想定（最新 50 件）。
 * cost.model / cost.inputTokens 等の CostBreakdown は使わず、必要な列だけ受ける
 * （RSC payload を絞る）。
 */
export interface RecentRow {
  ts: string;
  stage: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  jpy: number;
}

type ModelKey = "all" | string; // "all" or model id
type StageKey = "all" | string;

const STAGE_LABELS = ["①要約", "③生成", "③整形", "④面談内容", "⑤評価"];

export function RecentCallsFilter({
  rows,
  initialLimit = 20,
}: {
  rows: RecentRow[];
  initialLimit?: number;
}) {
  const [modelKey, setModelKey] = useState<ModelKey>("all");
  const [stageKey, setStageKey] = useState<StageKey>("all");
  const [expanded, setExpanded] = useState(false);

  // モデル選択肢は実データから抽出（Claude 3 種前提だが、旧データの他モデルも出す）
  const modelOptions = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.model));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (modelKey !== "all" && r.model !== modelKey) return false;
      if (stageKey !== "all" && r.stage !== stageKey) return false;
      return true;
    });
  }, [rows, modelKey, stageKey]);

  const shown = expanded ? filtered : filtered.slice(0, initialLimit);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs text-muted-foreground mr-1">モデル:</span>
        <Chip active={modelKey === "all"} onClick={() => setModelKey("all")}>
          全て
        </Chip>
        {modelOptions.map((m) => (
          <Chip
            key={m}
            active={modelKey === m}
            onClick={() => setModelKey(m)}
            title={m}
          >
            {shortModelLabel(m)}
          </Chip>
        ))}
        <div className="w-2" />
        <span className="text-xs text-muted-foreground mr-1">工程:</span>
        <Chip active={stageKey === "all"} onClick={() => setStageKey("all")}>
          全て
        </Chip>
        {STAGE_LABELS.map((s) => (
          <Chip
            key={s}
            active={stageKey === s}
            onClick={() => setStageKey(s)}
          >
            {s}
          </Chip>
        ))}
        <div className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtered.length} 件
          {filtered.length !== rows.length && (
            <span> / 全 {rows.length}</span>
          )}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground border-b">
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
          {shown.map((r, i) => (
            <tr key={i}>
              <td className="px-2 py-1 text-xs tabular-nums text-muted-foreground">
                {r.ts.replace("T", " ").slice(0, 16)}
              </td>
              <td className="px-2 py-1">{r.stage}</td>
              <td className="px-2 py-1 text-[12px]">
                {PROVIDERS[r.provider]?.icon ?? "•"}{" "}
                {PROVIDERS[r.provider]?.displayName ?? r.provider}
              </td>
              <td className="px-2 py-1 font-mono text-xs">{r.model}</td>
              <td className="text-right tabular-nums text-muted-foreground">
                {r.inputTokens.toLocaleString()}
              </td>
              <td className="text-right tabular-nums text-muted-foreground">
                {r.outputTokens.toLocaleString()}
              </td>
              <td className="text-right tabular-nums font-medium">
                {fmtJpy(r.jpy)}
              </td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td
                colSpan={7}
                className="px-2 py-6 text-center text-xs text-muted-foreground"
              >
                該当する記録がありません
              </td>
            </tr>
          )}
          {!expanded && filtered.length > initialLimit && (
            <tr>
              <td colSpan={7} className="text-center py-2">
                <button
                  type="button"
                  onClick={() => setExpanded(true)}
                  className="text-xs text-primary hover:underline"
                >
                  残り {filtered.length - initialLimit} 件を表示 →
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card border-border hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

/** claude-haiku-4-5-20251001 → Haiku 4.5、gpt-4o → GPT-4o 等 */
function shortModelLabel(id: string): string {
  if (id.startsWith("claude-haiku")) return "Haiku";
  if (id.startsWith("claude-sonnet")) return "Sonnet";
  if (id.startsWith("claude-opus")) return "Opus";
  if (id.startsWith("gpt-")) return id.replace(/^gpt-/, "GPT-");
  if (id.startsWith("gemini-")) return id.replace(/^gemini-/, "Gemini ");
  if (id.startsWith("o1")) return id.toUpperCase();
  return id;
}
