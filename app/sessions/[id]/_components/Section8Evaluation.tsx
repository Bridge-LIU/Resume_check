"use client";

import { useState, useTransition } from "react";
import type { Evaluation, Mode } from "@/lib/types";
import {
  buildEvaluationPromptAction,
  evaluateInterviewApiAction,
  saveEvaluationFromJsonAction,
} from "../actions";
import { MaxPromptCopy } from "./MaxPromptCopy";
import { ModeSwitch } from "./ModeSwitch";
import { SectionHeaderBar } from "./SectionHeaderBar";
import { type ProviderModelOverride } from "./ProviderModelSelect";
import { useStableSectionScroll } from "./useStableSectionScroll";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SAMPLE = `{
  "軸評価": [
    { "軸": "主体性", "スコア": 4.5, "根拠": "未経験ながら独学でCCNA範囲を学習し、ハンズオン環境を自費で構築した具体例があった" },
    { "軸": "問題解決力", "スコア": 3.5, "根拠": "障害切り分けの手順は ping→traceroute と説明できたが、原因特定の深掘りは曖昧で確証が不足" },
    { "軸": "対人影響力", "スコア": 4.2, "根拠": "前職で運用チーム3名のリーダー経験あり、エスカレーション基準を自分で整備した実績を具体的に語れた" },
    { "軸": "柔軟性", "スコア": 4.4, "根拠": "夜間作業のシフト変更や急な切替案件にも対応した経験があり、優先順位の付け方を説明できた" }
  ],
  "自己解決レベル": 4,
  "総合スコア": 4.15,
  "合否": "普通",
  "良い点": "学習意欲と初動の速さが具体例で確認できた。リーダー経験も等身大の表現で誇張がない。",
  "懸念点": "夜間作業の体力面の確証が薄い（要確認）。問題解決力の深掘り部分は次回オファー前に再確認したい。"
}`;

export function Section8Evaluation({
  sessionId,
  initial,
}: {
  sessionId: string;
  initial: Evaluation | null;
}) {
  // API モードを UI から隠しているため、表示・保存とも貼付モードに固定
  const [mode] = useState<Mode>("paste");
  const { ref: rootRef } = useStableSectionScroll(mode);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Evaluation | null>(initial);
  const [strict, setStrict] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isEvaluating, startEvaluate] = useTransition();
  const [llmOverride] = useState<ProviderModelOverride | undefined>(undefined);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveEvaluationFromJsonAction(sessionId, mode, rawText);
      if (!result.ok) {
        setError(result.error ?? "保存に失敗しました");
        return;
      }
      // 保存に成功 → 表示用は楽観的に rawText を再パース
      try {
        const parsed = JSON.parse(rawText) as Record<string, unknown>;
        setCurrent({
          mode,
          軸評価: (parsed["軸評価"] as Evaluation["軸評価"]) ?? [],
          自己解決レベル: parsed["自己解決レベル"] as number,
          総合スコア: parsed["総合スコア"] as number,
          合否: parsed["合否"] as Evaluation["合否"],
          良い点: (parsed["良い点"] as string) ?? "",
          懸念点: (parsed["懸念点"] as string) ?? "",
          updatedAt: new Date().toISOString(),
        });
        setRawText("");
      } catch {
        /* 保存自体は成功しているので再読込で反映 */
      }
    });
  }

  function handleEvaluateApi() {
    setError(null);
    startEvaluate(async () => {
      const res = await evaluateInterviewApiAction(sessionId, strict, llmOverride);
      if (!res.ok) {
        setError(res.error ?? "API評価に失敗しました");
        return;
      }
      if (res.data) setCurrent(res.data);
    });
  }

  const busy = isPending || isEvaluating;

  return (
    <div ref={rootRef}>
      <SectionHeaderBar title="⑤ 評価・合否判定" hasData={!!current}>
        <ModeSwitch mode={mode} />
      </SectionHeaderBar>

      {mode === "api" && (
        <div className="border rounded-lg p-3 mb-3 bg-zinc-50 space-y-3">
          <div className="text-xs text-zinc-600">
            ② 凍結条件 + ④ 議事録を入力に、AI が BARS で採点します。
            厳格モードでより高性能なモデルを使用。
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Button
              type="button"
              onClick={handleEvaluateApi}
              disabled={busy}
            >
              {isEvaluating ? "評価中…" : "評価する（API）"}
            </Button>
            <Label
              htmlFor="eval-strict-mode"
              className="flex items-center gap-2 text-sm font-normal text-zinc-700 cursor-pointer select-none"
            >
              <Switch
                id="eval-strict-mode"
                checked={strict}
                onCheckedChange={(v) => setStrict(v === true)}
                disabled={busy}
              />
              厳格モード（Opus 4.7）
            </Label>
            <span className="text-xs text-zinc-500">
              ※ 結果は自動保存されます。
            </span>
          </div>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
            >
              {error}
            </div>
          )}
        </div>
      )}

      {current && <EvaluationView evaluation={current} />}

      <details className="mt-3" open={!current && mode === "paste"}>
        <summary className="text-sm text-zinc-600 cursor-pointer">
          {current ? "貼り直す（JSON）" : "評価結果 JSON を貼り付ける"}
        </summary>
        <div className="mt-2 space-y-2">
          {mode === "paste" && (
            <MaxPromptCopy
              fetcher={() => buildEvaluationPromptAction(sessionId)}
              hint={
                <>
                  Max チャットで評価する場合：プロンプトをコピー → Max が返した JSON をそのまま下へペースト → 保存。
                  <br />
                  <span className="text-zinc-500">
                    ※ Max が <code>```json</code> で囲んだら囲みを除いてから貼ってください（パーサーは素の JSON しか受け付けません）。
                  </span>
                </>
              }
            />
          )}
          <Textarea
            className="w-full text-sm font-mono"
            rows={10}
            placeholder={SAMPLE}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
          {mode === "paste" && error && (
            <div
              role="alert"
              aria-live="assertive"
              className="text-xs text-red-700 border border-red-200 bg-red-50 rounded p-2"
            >
              {error}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleSave}
              disabled={busy || !rawText.trim()}
            >
              {isPending ? "保存中…" : "JSON を保存"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRawText(SAMPLE)}
            >
              サンプルを入れる
            </Button>
            <span className="text-xs text-zinc-500">
              期待スキーマ: 軸評価[] / 自己解決レベル / 総合スコア / 合否 / 良い点 / 懸念点
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}

function passingClass(g: Evaluation["合否"]): { text: string; ring: string } {
  switch (g) {
    case "合格":
      return { text: "text-emerald-700", ring: "from-emerald-50 to-blue-50" };
    case "普通":
      return { text: "text-amber-700", ring: "from-amber-50 to-zinc-50" };
    case "不合格":
      return { text: "text-red-700", ring: "from-red-50 to-zinc-50" };
  }
}

function barColor(score: number): string {
  if (score >= 4.2) return "bg-emerald-500";
  if (score >= 3.5) return "bg-amber-500";
  return "bg-red-500";
}

function EvaluationView({ evaluation }: { evaluation: Evaluation }) {
  const cls = passingClass(evaluation.合否);
  const max = 5;
  return (
    <div
      className={`border rounded p-4 bg-gradient-to-br ${cls.ring} space-y-3`}
    >
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <span className="text-xs text-zinc-500">総合</span>
          <div className="text-3xl font-bold tabular">
            {evaluation.総合スコア.toFixed(1)}
          </div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">合否</span>
          <div className={`text-xl font-bold ${cls.text}`}>
            {evaluation.合否}
            {evaluation.合否 === "合格" && " ✓"}
          </div>
        </div>
        <div>
          <span className="text-xs text-zinc-500">自己解決</span>
          <div className="text-xl font-bold tabular">
            {evaluation.自己解決レベル}
            <span className="text-sm text-zinc-400">/5</span>
          </div>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-zinc-400">
          保存: {new Date(evaluation.updatedAt).toLocaleString("ja-JP")}
        </span>
      </div>

      <div className="space-y-1">
        {evaluation.軸評価.map((a) => {
          const pct = Math.max(0, Math.min(100, (a.スコア / max) * 100));
          return (
            <div
              key={a.軸}
              className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-sm"
            >
              <div title={a.根拠}>{a.軸}</div>
              <div className="h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${barColor(a.スコア)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right tabular">{a.スコア.toFixed(1)}</div>
            </div>
          );
        })}
      </div>

      <div className="text-sm space-y-1 pt-2 border-t border-zinc-200/60">
        <div>
          <span className="text-zinc-500">良い点:</span> {evaluation.良い点}
        </div>
        <div>
          <span className="text-zinc-500">懸念点:</span> {evaluation.懸念点}
        </div>
      </div>

      {evaluation.軸評価.some((a) => a.根拠) && (
        <details className="text-xs text-zinc-600 pt-2 border-t border-zinc-200/60">
          <summary className="cursor-pointer">軸別の根拠を表示</summary>
          <dl className="mt-2 space-y-1">
            {evaluation.軸評価.map((a) => (
              <div key={a.軸} className="grid grid-cols-[110px_1fr] gap-2">
                <dt className="text-zinc-500">{a.軸}</dt>
                <dd>{a.根拠}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
