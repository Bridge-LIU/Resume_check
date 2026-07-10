"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CategoryEvaluation, CategoryKey, Evaluation, Mode } from "@/lib/types";
import { CATEGORY_KEYS } from "@/lib/types";
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
import { useStableSectionScroll } from "./useStableSectionScroll";
import { AutoSaveIndicator, useAutoSave } from "./useAutoSave";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";
import { Label } from "@/ui/label";
import { Switch } from "@/ui/switch";
import { Tip } from "@/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { scoreBarColor } from "@/lib/uiClass";

const SAMPLE = `{
  "人間性": {
    "小軸評価": [
      { "軸": "主体性", "スコア": 3.5, "根拠": "運用チームで自発的にリーダー役を担った具体例あり" },
      { "軸": "コミュニケーション力", "スコア": 4.2, "根拠": "顧客折衝経験を STAR で明瞭に説明" },
      { "軸": "学習意欲", "スコア": 4.0, "根拠": "業務外で CCNA 学習を継続" }
    ]
  },
  "技術力": {
    "小軸評価": [
      { "軸": "専門知識", "スコア": 4.5, "根拠": "BGP 設計・障害切り分け手順を体系的に説明" },
      { "軸": "問題解決力", "スコア": 4.0, "根拠": "深夜メンテで閾値付きロールバック判断を実施" },
      { "軸": "設計力", "スコア": 4.2, "根拠": "冗長化と可観測性の観点を含めた設計を提示" }
    ]
  },
  "自己解決レベル": 4,
  "合否": "普通",
  "良い点": "技術力の裏付けが定量的（BGP設計、切り分け手順）。志望度も企業理解の深さから確信できる。",
  "懸念点": "夜間作業の体力面の確証が薄い（要確認）。大規模チーム統率経験は限定的。"
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
  /** ⑥面談内容の updatedAt。評価より新しければ「最新ではない」と表示 */
  minutesUpdatedAt?: string | null;
}) {
  const router = useRouter();
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
    // 大分類スコア・総合スコアはサーバ側の重み付き平均計算に依存する。
    // 楽観的な client 側再構築は困難なので、router.refresh() でサーバから最新を取り直す。
    setRawText("");
    lastSavedRawRef.current = "";
    router.refresh();
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

  // 評価保存後に ④凍結条件 or ⑥面談内容 が更新されていたら「最新ではない」
  const staleReasons: string[] = [];
  if (current) {
    const evalT = Date.parse(current.updatedAt);
    if (frozenAt && Number.isFinite(evalT)) {
      const t = Date.parse(frozenAt);
      if (Number.isFinite(t) && t > evalT) staleReasons.push("凍結条件");
    }
    if (minutesUpdatedAt && Number.isFinite(evalT)) {
      const t = Date.parse(minutesUpdatedAt);
      if (Number.isFinite(t) && t > evalT) staleReasons.push("面談内容");
    }
  }

  return (
    <div ref={rootRef}>
      <SectionHeaderBar title="⑤ 評価・合否判定" hasData={!!current}>
        <ModeSwitch mode={mode} onChange={setMode} apiLabel="API評価" />
        {mode === "api" && llmDefaults && (
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
        <div className="border rounded-lg p-3 mb-3 bg-muted space-y-3">
          <div className="text-xs text-muted-foreground">
            ② 凍結条件 + ④ 面談内容を入力に、AI が BARS で採点します。
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
              className="flex items-center gap-2 text-sm font-normal text-foreground/85 cursor-pointer select-none"
            >
              <Switch
                id="eval-strict-mode"
                checked={strict}
                onCheckedChange={(v) => setStrict(v === true)}
                disabled={busy}
              />
              厳格モード（Opus 4.7）
            </Label>
            <span className="text-xs text-muted-foreground">
              ※ 結果は自動保存されます。
            </span>
          </div>
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/40 rounded px-3 py-2"
            >
              {error}
            </div>
          )}
        </div>
      )}

      {current && staleReasons.length > 0 && (
        <div
          role="status"
          className="mb-3 text-sm border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 text-amber-900 dark:text-amber-200 rounded px-3 py-2 flex items-start gap-2"
        >
          <span aria-hidden="true">⚠️</span>
          <div>
            <div className="font-medium">この評価結果は最新ではありません</div>
            <div className="text-xs text-amber-800 dark:text-amber-300/90 mt-0.5">
              {staleReasons.join(" / ")} が評価保存後に更新されています。再評価を推奨します。
            </div>
          </div>
        </div>
      )}

      {current && <EvaluationView evaluation={current} />}

      {/* 既に current があっても JSON 貼直し UI が畳まれると動線が消えるので常に open */}
      <Collapsible defaultOpen className="mt-3">
        <CollapsibleTrigger className="group inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]:rotate-90" />
          {current ? "貼り直す（JSON）" : "評価結果 JSON を貼り付ける"}
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 space-y-2">
          {mode === "paste" && (
            <MaxPromptCopy
              fetcher={() => buildEvaluationPromptAction(sessionId)}
              hint={
                <>
                  Max チャットで評価する場合：プロンプトをコピー → Max が返した JSON をそのまま下へペースト → 保存。
                  <br />
                  <span className="text-muted-foreground">
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
              className="text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 rounded p-2"
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
            <span className="text-xs text-muted-foreground opacity-70">
              貼り付け後、テキスト欄からフォーカスを外すと自動保存
            </span>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function passingClass(g: Evaluation["合否"] | string | undefined): { text: string; ring: string } {
  // 型的には合格/普通/不合格 の 3 択だが、旧データや解析ゆらぎで想定外文字列が
  // 入ることがあるので、defensive に既定値を返す（画面が真っ白になるより見えたほうが良い）
  switch (g) {
    case "合格":
      return {
        text: "text-emerald-700 dark:text-emerald-300",
        ring: "from-emerald-50 to-blue-50 dark:from-emerald-500/10 dark:to-blue-500/10",
      };
    case "普通":
      return {
        text: "text-amber-700 dark:text-amber-300",
        ring: "from-amber-50 to-zinc-50 dark:from-amber-500/10 dark:to-zinc-800/50",
      };
    case "不合格":
      return {
        text: "text-red-700 dark:text-red-300",
        ring: "from-red-50 to-zinc-50 dark:from-red-500/10 dark:to-zinc-800/50",
      };
    default:
      return {
        text: "text-foreground/85",
        ring: "from-zinc-50 to-zinc-100 dark:from-zinc-800/50 dark:to-zinc-800",
      };
  }
}

function categoryColor(key: CategoryKey) {
  return key === "人間性"
    ? { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-300 dark:border-emerald-500/40" }
    : { text: "text-blue-700 dark:text-blue-300", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-300 dark:border-blue-500/40" };
}

function CategoryBlock({ label, cat }: { label: CategoryKey; cat: CategoryEvaluation }) {
  const cc = categoryColor(label);
  const max = 5;
  return (
    <div className={`border ${cc.border} rounded-lg overflow-hidden`}>
      <div className={`${cc.bg} px-3 py-2 flex items-center gap-3`}>
        <div className={`font-bold ${cc.text}`}>{label}</div>
        <div className="flex-1" />
        <div className={`text-xl font-bold tabular ${cc.text}`}>
          {cat.スコア.toFixed(1)}
          <span className="text-xs font-normal opacity-70"> / 5</span>
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        {cat.小軸評価.map((a) => {
          const pct = Math.max(0, Math.min(100, (a.スコア / max) * 100));
          return (
            <div
              key={a.軸}
              className="grid grid-cols-[110px_1fr_40px] items-center gap-2 text-sm"
            >
              <Tip content={a.根拠 || null}>
                <div className="cursor-help truncate">{a.軸}</div>
              </Tip>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-1.5 rounded-full ${scoreBarColor(a.スコア)}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="text-right tabular">{a.スコア.toFixed(1)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvaluationView({ evaluation }: { evaluation: Evaluation }) {
  const cls = passingClass(evaluation.合否);
  const allSubAxes = CATEGORY_KEYS.flatMap((k) => evaluation[k].小軸評価);
  return (
    <div className={`border rounded-lg p-4 bg-gradient-to-br ${cls.ring} space-y-3`}>
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <span className="text-xs text-muted-foreground">総合</span>
          <div className="text-3xl font-bold tabular">
            {evaluation.総合スコア.toFixed(1)}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">合否</span>
          <div className={`text-xl font-bold ${cls.text}`}>
            {evaluation.合否}
            {evaluation.合否 === "合格" && " ✓"}
          </div>
        </div>
        <div>
          <span className="text-xs text-muted-foreground">自己解決</span>
          <div className="text-xl font-bold tabular">
            {evaluation.自己解決レベル}
            <span className="text-sm text-muted-foreground opacity-70">/5</span>
          </div>
        </div>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground opacity-70">
          保存: {new Date(evaluation.updatedAt).toLocaleString("ja-JP")}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {CATEGORY_KEYS.map((k) => (
          <CategoryBlock key={k} label={k} cat={evaluation[k]} />
        ))}
      </div>

      <div className="text-sm space-y-1 pt-2 border-t border-border/60">
        <div>
          <span className="text-muted-foreground">良い点:</span> {evaluation.良い点}
        </div>
        <div>
          <span className="text-muted-foreground">懸念点:</span> {evaluation.懸念点}
        </div>
      </div>

      {allSubAxes.some((a) => a.根拠) && (
        <Collapsible className="text-xs text-muted-foreground pt-2 border-t border-border/60">
          <CollapsibleTrigger className="group inline-flex items-center gap-1 hover:text-foreground">
            <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
            軸別の根拠を表示
          </CollapsibleTrigger>
          <CollapsibleContent>
            <dl className="mt-2 space-y-1">
              {CATEGORY_KEYS.flatMap((k) =>
                evaluation[k].小軸評価.map((a) => (
                  <div key={`${k}-${a.軸}`} className="grid grid-cols-[140px_1fr] gap-2">
                    <dt className="text-muted-foreground">
                      <span className="text-[10px] mr-1 opacity-70">[{k}]</span>
                      {a.軸}
                    </dt>
                    <dd>{a.根拠}</dd>
                  </div>
                )),
              )}
            </dl>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
