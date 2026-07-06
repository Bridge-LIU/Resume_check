"use client";

import { useRef, useState, useTransition } from "react";
import type { Evaluation, Mode } from "@/lib/types";
import {
  buildEvaluationPromptAction,
  evaluateInterviewApiAction,
  saveEvaluationFromJsonAction,
} from "../actions";
import { MaxPromptCopy } from "./MaxPromptCopy";
import { ModeSwitch } from "./ModeSwitch";
import { SectionHeaderBar } from "./SectionHeaderBar";
import {
  ProviderModelSelect,
  type ProviderModelOverride,
} from "./ProviderModelSelect";
import type { LlmDefaults } from "../page";
import { useIsFullEdition } from "@/app/_components/EditionProvider";
import { useStableSectionScroll } from "./useStableSectionScroll";
import { AutoSaveIndicator, useAutoSave } from "./useAutoSave";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SAMPLE = `{
  "軸評価": [
    { "軸": "非技術", "スコア": 3.8, "根拠": "主体性・コミュ力・学習意欲を包括評価。前職で運用チーム3名のリーダー経験、業務外でCCNA学習を継続していた具体例が語れた" },
    { "軸": "技術", "スコア": 4.5, "根拠": "NW/サーバ技術力・問題解決力を包括評価。障害切り分け手順の説明が体系的で、実案件でのBGP設計経験も定量的に語れた" },
    { "軸": "総合", "スコア": 4.0, "根拠": "志望度・カルチャーフィット・定着性の総合印象。企業理解が深く、逆質問も事業戦略まで踏み込む。前職在籍4年で定着性も良好" }
  ],
  "自己解決レベル": 4,
  "総合スコア": 4.15,
  "合否": "普通",
  "良い点": "技術力の裏付けが定量的（BGP設計、切り分け手順）。志望度も企業理解の深さから確信できる。",
  "懸念点": "夜間作業の体力面の確証が薄い（要確認）。非技術面は良好だが、大規模チーム統率経験は限定的。"
}`;

export function Section8Evaluation({
  sessionId,
  initial,
  llmDefaults,
  frozenAt,
  minutesUpdatedAt,
}: {
  sessionId: string;
  initial: Evaluation | null;
  llmDefaults?: LlmDefaults;
  /** ④凍結条件の frozenAt。評価より新しければ「最新ではない」と表示 */
  frozenAt?: string | null;
  /** ⑥議事録の updatedAt。評価より新しければ「最新ではない」と表示 */
  minutesUpdatedAt?: string | null;
}) {
  const isFull = useIsFullEdition();
  // 貼付版（lite）: ModeSwitch 側で onChange が無効化され "paste" 固定
  // 完全版（full）: 貼付 / API をユーザがトグル可
  const [mode, setMode] = useState<Mode>("paste");
  const { ref: rootRef } = useStableSectionScroll(mode);
  const [rawText, setRawText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<Evaluation | null>(initial);
  const [strict, setStrict] = useState(false);
  const [isEvaluating, startEvaluate] = useTransition();
  const [llmOverride, setLlmOverride] = useState<ProviderModelOverride | undefined>(undefined);
  const { save, isSaving, state } = useAutoSave();
  const lastSavedRawRef = useRef("");

  async function handleAutoSave() {
    const snapshot = rawText.trim();
    if (!snapshot) return; // 空欄では発火しない
    if (snapshot === lastSavedRawRef.current) return;
    setError(null);
    const currentMode = mode;
    const ok = await save(async () => {
      const result = await saveEvaluationFromJsonAction(
        sessionId,
        currentMode,
        rawText,
      );
      if (!result.ok) {
        setError(result.error ?? "保存に失敗しました");
      }
      return result;
    });
    if (!ok) return;
    lastSavedRawRef.current = snapshot;
    // 保存に成功 → 表示用は楽観的に rawText を再パース
    try {
      const parsed = JSON.parse(rawText) as Record<string, unknown>;
      setCurrent({
        mode: currentMode,
        軸評価: (parsed["軸評価"] as Evaluation["軸評価"]) ?? [],
        自己解決レベル: parsed["自己解決レベル"] as number,
        総合スコア: parsed["総合スコア"] as number,
        合否: parsed["合否"] as Evaluation["合否"],
        良い点: (parsed["良い点"] as string) ?? "",
        懸念点: (parsed["懸念点"] as string) ?? "",
        updatedAt: new Date().toISOString(),
      });
      setRawText("");
      lastSavedRawRef.current = "";
    } catch {
      /* 保存自体は成功しているので再読込で反映 */
    }
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

  const busy = isSaving || isEvaluating;

  // 評価保存後に ④凍結条件 or ⑥議事録 が更新されていたら「最新ではない」
  const staleReasons: string[] = [];
  if (current) {
    const evalT = Date.parse(current.updatedAt);
    if (frozenAt && Number.isFinite(evalT)) {
      const t = Date.parse(frozenAt);
      if (Number.isFinite(t) && t > evalT) staleReasons.push("凍結条件");
    }
    if (minutesUpdatedAt && Number.isFinite(evalT)) {
      const t = Date.parse(minutesUpdatedAt);
      if (Number.isFinite(t) && t > evalT) staleReasons.push("議事録");
    }
  }

  return (
    <div ref={rootRef}>
      <SectionHeaderBar title="⑤ 評価・合否判定" hasData={!!current}>
        <ModeSwitch mode={mode} onChange={setMode} apiLabel="API評価" />
        {isFull && mode === "api" && llmDefaults && (
          <ProviderModelSelect
            stage={strict ? "evaluationStrict" : "evaluation"}
            defaultProvider={llmDefaults.defaultProvider}
            defaultModel={
              strict
                ? llmDefaults.modelBy.evaluationStrict
                : llmDefaults.modelBy.evaluation
            }
            value={llmOverride}
            onChange={setLlmOverride}
            hasKey={llmDefaults.hasKey}
            disabled={busy}
          />
        )}
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

      {current && staleReasons.length > 0 && (
        <div
          role="status"
          className="mb-3 text-sm border border-amber-300 bg-amber-50 text-amber-900 rounded px-3 py-2 flex items-start gap-2"
        >
          <span aria-hidden="true">⚠️</span>
          <div>
            <div className="font-medium">この評価結果は最新ではありません</div>
            <div className="text-xs text-amber-800 mt-0.5">
              {staleReasons.join(" / ")} が評価保存後に更新されています。再評価を推奨します。
            </div>
          </div>
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
          <div className="relative">
            <Textarea
              className="w-full text-sm font-mono pr-3 pb-6"
              rows={10}
              placeholder={SAMPLE}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onBlur={handleAutoSave}
            />
            <AutoSaveIndicator state={state} />
          </div>
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
              variant="outline"
              size="sm"
              onClick={() => setRawText(SAMPLE)}
              disabled={busy}
            >
              サンプルを入れる
            </Button>
            <span className="text-xs text-zinc-400">
              貼り付け後、テキスト欄からフォーカスを外すと自動保存
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}

function passingClass(g: Evaluation["合否"] | string | undefined): { text: string; ring: string } {
  // 型的には合格/普通/不合格 の 3 択だが、旧データや解析ゆらぎで想定外文字列が
  // 入ることがあるので、defensive に既定値を返す（画面が真っ白になるより見えたほうが良い）
  switch (g) {
    case "合格":
      return { text: "text-emerald-700", ring: "from-emerald-50 to-blue-50" };
    case "普通":
      return { text: "text-amber-700", ring: "from-amber-50 to-zinc-50" };
    case "不合格":
      return { text: "text-red-700", ring: "from-red-50 to-zinc-50" };
    default:
      return { text: "text-zinc-700", ring: "from-zinc-50 to-zinc-100" };
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
