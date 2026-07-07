"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Mode, Questions, QuestionCounts } from "@/lib/types";
import { parseQuestions } from "@/lib/questionParser";
import {
  buildQuestionsPromptAction,
  generateQuestionsApiAction,
  reformatQuestionsApiAction,
  saveQuestionsAction,
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
import { useConfirm } from "@/components/ui/use-confirm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tip } from "@/components/ui/tooltip";

const NON_TECH_HEADER = "## 非技術";
const TECH_HEADER = "## 技術";

const DEFAULT_NON_TECH_TEMPLATE = `⭐ Q1. 簡単に自己紹介をお願いします（職歴・現在の役割・志望動機）
  狙い: コミュニケーション力 / 整理して話す力
  解答例: 時系列で簡潔に。冗長 / 自慢過多は減点

Q2. これまでのキャリアで最も成長を実感した経験は？
  狙い: 主体性 / 学習意欲
  解答例: STAR で。自発的な動きと結果まで語れるか

Q3. あなたの強みと弱みを3つずつ教えてください
  狙い: 自己客観視 / 柔軟性
  解答例: 弱みを「対処の仕方」まで語れるか

Q4. 学生時代や前職で「最も努力したこと」は？
  狙い: 継続力 / 困難への向き合い方
  解答例: 期間と途中の壁を具体的に

Q5. チームで意見が割れたとき、あなたはどう動きますか？
  狙い: 対人影響力 / 調整力
  解答例: 実例で、相手の立場理解と落とし所まで

Q6. ストレスの発散方法や趣味、好きなスポーツはありますか？
  狙い: ストレス対処 / 人物像
  解答例: 偏らないバランス感を見る

⭐ Q7. 5年後、どんな仕事をしていたいですか？当社でどう実現したい？
  狙い: 入社意欲 / キャリアの整合性
  解答例: 自社事業とのつながりが具体的か`;

const TECH_PLACEHOLDER = `例（候補者の経歴・求人情報から Max が生成 or 手書き）:

⭐ T1. これまでに自分の手で config を流した NW 案件を1つ選び、構成・自分の判断・期間を STAR で
  狙い: NW 構築スキルの現在進行形での維持
  解答例: 直近案件名と自分の役割を具体化

T2. BGP 改修で深夜メンテを完遂された経験で、最も切替が危なかった1回を選んで
  狙い: 夜間作業耐性 / 責任感 / 問題解決力
  解答例: 「N分以内に収束しなければロールバック」の閾値を明示できるか`;

/**
 * rawText を「非技術／技術」に分割する。見出しが無ければ全部を非技術として扱う（後方互換）。
 * LLM が # / ## / ### のどれで出力してもマッチするよう正規表現で見出し検索。
 */
const NON_TECH_HEADER_MATCH_RE = /^#+\s*非技術\s*$/m;
const TECH_HEADER_MATCH_RE = /^#+\s*技術\s*$/m;
function findHeader(raw: string, re: RegExp): { start: number; end: number } | null {
  const m = re.exec(raw);
  if (!m) return null;
  return { start: m.index, end: m.index + m[0].length };
}
function splitSections(raw: string): { nonTech: string; tech: string } {
  const non = findHeader(raw, NON_TECH_HEADER_MATCH_RE);
  const tech = findHeader(raw, TECH_HEADER_MATCH_RE);
  if (!non && !tech) {
    return { nonTech: raw, tech: "" };
  }
  if (non && !tech) {
    return { nonTech: raw.slice(non.end).trim(), tech: "" };
  }
  if (!non && tech) {
    return { nonTech: "", tech: raw.slice(tech.end).trim() };
  }
  // 両方ある場合
  if (non!.start < tech!.start) {
    return {
      nonTech: raw.slice(non!.end, tech!.start).trim(),
      tech: raw.slice(tech!.end).trim(),
    };
  }
  return {
    tech: raw.slice(tech!.end, non!.start).trim(),
    nonTech: raw.slice(non!.end).trim(),
  };
}

function joinSections(nonTech: string, tech: string): string {
  const n = nonTech.trim();
  const t = tech.trim();
  if (!n && !t) return "";
  return `${NON_TECH_HEADER}\n${n}\n\n${TECH_HEADER}\n${t}\n`;
}

export function Section5Questions({
  sessionId,
  initial,
  questionCounts,
  llmDefaults,
}: {
  sessionId: string;
  initial: Questions | null;
  questionCounts: QuestionCounts;
  llmDefaults?: LlmDefaults;
}) {
  const isFull = useIsFullEdition();
  const targetNonTech = questionCounts.nontech;
  const targetTech = questionCounts.tech;
  // 貼付版（lite）: ModeSwitch 側で onChange が無効化され "paste" 固定
  // 完全版（full）: 貼付 / API をユーザがトグル可
  const [mode, setMode] = useState<Mode>("paste");
  const { ref: rootRef } = useStableSectionScroll(mode);
  const initialSplit = splitSections(initial?.rawText ?? "");
  const [nonTech, setNonTech] = useState(initialSplit.nonTech);
  const [tech, setTech] = useState(initialSplit.tech);
  const { save, isSaving, savedAt, setSavedAt, state } = useAutoSave();
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, startGen] = useTransition();
  const [isReformatting, startReformat] = useTransition();
  const [llmOverride, setLlmOverride] = useState<ProviderModelOverride | undefined>(undefined);
  const { confirm, ConfirmDialog } = useConfirm();

  const combined = joinSections(nonTech, tech);
  const initialCombined = initial?.rawText ?? "";
  const lastSavedRef = useRef(initialCombined);
  useEffect(() => {
    setSavedAt(initial?.updatedAt ?? null);
  }, [initial?.updatedAt, setSavedAt]);

  async function handleAutoSave() {
    if (combined === lastSavedRef.current) return;
    const snapshot = combined;
    const currentMode = mode;
    const ok = await save(() => saveQuestionsAction(sessionId, currentMode, snapshot));
    if (ok) lastSavedRef.current = snapshot;
  }

  function handleGenerate() {
    setError(null);
    startGen(async () => {
      const res = await generateQuestionsApiAction(sessionId, llmOverride);
      if (!res.ok) {
        setError(res.error ?? "生成に失敗しました");
        return;
      }
      if (res.text != null) {
        // 戻ってきた整形済みテキストを 2 セクションに振り分け
        const split = splitSections(res.text);
        let newNonTech = nonTech;
        let newTech = tech;
        if (!split.nonTech && !split.tech) {
          newTech = res.text;
          setTech(res.text);
        } else {
          if (split.nonTech) {
            newNonTech = split.nonTech;
            setNonTech(split.nonTech);
          }
          if (split.tech) {
            newTech = split.tech;
            setTech(split.tech);
          }
        }
        // Server 側で saveQuestions 済み → クライアント状態も同期
        lastSavedRef.current = joinSections(newNonTech, newTech);
      }
      setSavedAt(new Date().toISOString());
    });
  }

  async function handleReformat() {
    if (!combined.trim()) {
      setError("整形する質問テキストがありません。");
      return;
    }
    const ok = await confirm({
      title: "Haiku 4.5 で整形して上書きしますか？",
      description: "元の質問テキストには戻せません。よろしいですか？",
      confirmLabel: "整形で上書き",
      destructive: true,
    });
    if (!ok) return;
    setError(null);
    startReformat(async () => {
      const res = await reformatQuestionsApiAction(sessionId, llmOverride);
      if (!res.ok) {
        setError(res.error ?? "整形に失敗しました");
        return;
      }
      if (res.text != null) {
        const split = splitSections(res.text);
        let newNonTech = "";
        let newTech = "";
        if (!split.nonTech && !split.tech) {
          newTech = res.text;
          setTech(res.text);
        } else {
          newNonTech = split.nonTech;
          newTech = split.tech;
          setNonTech(split.nonTech);
          setTech(split.tech);
        }
        lastSavedRef.current = joinSections(newNonTech, newTech);
      }
      setSavedAt(new Date().toISOString());
    });
  }

  const busy = isSaving || isGenerating || isReformatting;

  async function handleInsertTemplate() {
    if (nonTech.trim()) {
      const ok = await confirm({
        title: "現在の非技術質問を上書きしますか？",
        description: "テンプレートで置き換えます。",
        confirmLabel: "上書きする",
        destructive: true,
      });
      if (!ok) return;
    }
    setNonTech(DEFAULT_NON_TECH_TEMPLATE);
  }

  // 質問件数のラフカウント（⭐ または Q または T で始まる行）
  const nonTechCount = (nonTech.match(/^[⭐\s]*[QT]\d/gm) || []).length;
  const techCount = (tech.match(/^[⭐\s]*[QT]\d/gm) || []).length;

  return (
    <div ref={rootRef}>
      <SectionHeaderBar
        title="③ 質問リスト"
        hasData={!!initial?.rawText?.trim()}
      >
        <ModeSwitch mode={mode} onChange={setMode} apiLabel="API生成" />
        {isFull && mode === "api" && llmDefaults && (
          <ProviderModelSelect
            stage="questions"
            defaultProvider={llmDefaults.defaultProvider}
            defaultModel={llmDefaults.modelBy.questions}
            value={llmOverride}
            onChange={setLlmOverride}
            hasKey={llmDefaults.hasKey}
            disabled={isGenerating || isReformatting || isSaving}
          />
        )}
      </SectionHeaderBar>

      {mode === "api" && (
        <div className="border rounded p-3 mb-2 bg-muted flex items-center gap-3 text-sm">
          <div className="flex-1 text-muted-foreground min-w-0">
            ① 面談者情報 + ② 凍結条件を入力に、AI で「非技術 {targetNonTech} 問 + 技術 {targetTech} 問」を section 付きで生成します。
          </div>
          <Button
            type="button"
            onClick={handleGenerate}
            disabled={busy}
          >
            {isGenerating ? "生成中…" : "質問を生成"}
          </Button>
        </div>
      )}

      {mode === "paste" && (
        <MaxPromptCopy
          fetcher={() => buildQuestionsPromptAction(sessionId)}
          hint={
            <>
              Max チャットで生成する場合：プロンプトをコピー → Max に貼付 → 出力（## 非技術 / ## 技術 の section 付き）を下にペースト → 保存。
            </>
          }
          className="mb-2"
        />
      )}

      {/* カウンター — 目標値は設定の questionCounts（exact match で緑/青判定） */}
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span
          className={`px-2 py-1 rounded font-medium ${
            nonTechCount === targetNonTech
              ? "bg-emerald-100 text-emerald-800"
              : nonTechCount === 0
                ? "bg-muted text-muted-foreground"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          非技術 {nonTechCount}/{targetNonTech}{" "}
          {nonTechCount === targetNonTech ? "✓" : nonTechCount === 0 ? "" : "⚠"}
        </span>
        <span
          className={`px-2 py-1 rounded font-medium ${
            techCount === targetTech
              ? "bg-blue-100 text-blue-800"
              : techCount === 0
                ? "bg-muted text-muted-foreground"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          技術 {techCount}/{targetTech}{" "}
          {techCount === targetTech ? "✓" : techCount === 0 ? "" : "⚠"}
        </span>
        <span className="text-muted-foreground">合計 {nonTechCount + techCount} 問</span>
        <div className="flex-1" />
        <Tip content="非技術のデフォルトテンプレ（固定 7 問）を左カラムに流し込む">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleInsertTemplate}
            disabled={busy}
          >
            📝 非技術テンプレを入れる
          </Button>
        </Tip>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 左: 非技術 */}
        <div>
          <div className="text-xs font-medium text-emerald-800 mb-1 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-100">非技術</span>
            <span className="text-muted-foreground">候補者によらない共通質問</span>
          </div>
          <div className="relative">
            <Textarea
              className="w-full text-sm font-mono bg-emerald-50 pr-3 pb-6"
              rows={14}
              placeholder={DEFAULT_NON_TECH_TEMPLATE}
              value={nonTech}
              onChange={(e) => setNonTech(e.target.value)}
              onBlur={handleAutoSave}
            />
            <AutoSaveIndicator state={state} />
          </div>
        </div>

        {/* 右: 技術 */}
        <div>
          <div className="text-xs font-medium text-blue-800 mb-1 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-blue-100">技術</span>
            <span className="text-muted-foreground">候補者の経歴に合わせた専門質問</span>
          </div>
          <div className="relative">
            <Textarea
              className="w-full text-sm font-mono bg-blue-50 pr-3 pb-6"
              rows={14}
              placeholder={TECH_PLACEHOLDER}
              value={tech}
              onChange={(e) => setTech(e.target.value)}
              onBlur={handleAutoSave}
            />
            <AutoSaveIndicator state={state} />
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="mt-2 border border-red-200 bg-red-50 text-red-700 text-sm rounded px-3 py-2"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 flex-wrap">
        <span className="text-xs text-muted-foreground opacity-70">
          {savedAt
            ? `最終保存: ${new Date(savedAt).toLocaleString("ja-JP")}`
            : "未保存（フォーカスを外すと自動保存）"}
        </span>
        <div className="flex-1" />
        <Tip content="Haiku 4.5 で ⭐/狙い/解答例 のフォーマットに整形して上書き">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleReformat}
            disabled={busy || !combined.trim()}
          >
            {isReformatting ? "整形中…" : "手入力を整形（API）"}
          </Button>
        </Tip>
      </div>

      <StructuredPreview combined={combined} />

      <div className="text-xs text-muted-foreground mt-2">
        ※ 保存時は <code className="bg-muted px-1 rounded">## 非技術</code> /{" "}
        <code className="bg-muted px-1 rounded">## 技術</code> の見出し付きで結合されます。
        旧形式（見出しなし）は左の「非技術」に取り込まれます。
      </div>
      <ConfirmDialog />
    </div>
  );
}

/** 構造化プレビュー：rawText を parseQuestions で配列化してカード表示。折りたたみ可能 */
function StructuredPreview({ combined }: { combined: string }) {
  const { nonTech, tech } = parseQuestions(combined);
  const total = nonTech.length + tech.length;
  if (total === 0) return null;

  return (
    <details className="mt-3 border rounded-lg" open>
      <summary className="cursor-pointer text-xs text-muted-foreground px-3 py-2 bg-muted select-none">
        構造化プレビュー — {total} 問（非技術 {nonTech.length} / 技術 {tech.length}）
        <span className="text-muted-foreground opacity-70 ml-2">
          ※ 保存時に questions.json の items 配列に同じ内容が入ります
        </span>
      </summary>
      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
        <CategoryCard
          title="非技術"
          items={nonTech}
          prefix="Q"
          bg="bg-emerald-50/50"
          accent="border-l-emerald-400"
        />
        <CategoryCard
          title="技術"
          items={tech}
          prefix="T"
          bg="bg-blue-50/50"
          accent="border-l-blue-400"
        />
      </div>
    </details>
  );
}

function CategoryCard({
  title,
  items,
  prefix,
  bg,
  accent,
}: {
  title: string;
  items: ReturnType<typeof parseQuestions>["nonTech"];
  prefix: "Q" | "T";
  bg: string;
  accent: string;
}) {
  return (
    <div className={`rounded ${bg} p-2`}>
      <div className="text-xs font-medium text-foreground/85 mb-2">
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-muted-foreground opacity-70 px-2 py-3 text-center">なし</div>
      ) : (
        <ol className="space-y-2">
          {items.map((q, i) => (
            <li
              key={i}
              className={`bg-card border border-l-4 ${accent} rounded px-2.5 py-2`}
            >
              <div className="flex items-start gap-1.5">
                <span className="text-muted-foreground opacity-70 text-xs tabular shrink-0 pt-0.5">
                  {prefix}
                  {i + 1}
                </span>
                {q.star && (
                  <span className="text-amber-500 shrink-0 pt-0.5" title="必須質問">
                    ⭐
                  </span>
                )}
                <span className="text-sm font-medium text-foreground leading-snug">
                  {q.question}
                </span>
              </div>
              {(q.aim || q.example) && (
                <div className="mt-1.5 pl-6 space-y-1">
                  {q.aim && (
                    <div className="border-l-2 border-amber-300 pl-2">
                      <div className="text-[10px] text-amber-700 font-medium leading-tight">
                        狙い
                      </div>
                      <div className="text-[11px] text-foreground/85 leading-snug">
                        {q.aim}
                      </div>
                    </div>
                  )}
                  {q.example && (
                    <div className="border-l-2 border-sky-300 pl-2">
                      <div className="text-[10px] text-sky-700 font-medium leading-tight">
                        解答例
                      </div>
                      <div className="text-[11px] text-foreground/85 leading-snug">
                        {q.example}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
