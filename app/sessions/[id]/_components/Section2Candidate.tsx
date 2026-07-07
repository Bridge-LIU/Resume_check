"use client";

import { useEffect, useRef, useState } from "react";
import type { Candidate, Mode } from "@/lib/types";
import {
  buildSummaryPromptAction,
  saveCandidateAction,
  summarizeCandidateApiAction,
} from "../actions";
import { MaxPromptCopy } from "./MaxPromptCopy";
import { ModeSwitch } from "./ModeSwitch";
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
import {
  detectResumeKind,
  isLegacyXls,
  kindIcon,
  kindLabel,
  RESUME_FILE_ACCEPT,
  type ResumeKind,
} from "@/lib/resumeKind";
import { formatStructuredSummary } from "@/lib/summaryFormat";
import { SectionHeaderBar } from "./SectionHeaderBar";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // dataURL: "data:application/pdf;base64,XXXX..." → "XXXX..." を抽出
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("ファイル読込に失敗しました"));
    reader.readAsDataURL(file);
  });
}

export function Section2Candidate({
  sessionId,
  initial,
  llmDefaults,
}: {
  sessionId: string;
  initial: Candidate | null;
  llmDefaults?: LlmDefaults;
}) {
  const isFull = useIsFullEdition();
  // 貼付版（lite）: ModeSwitch 側で onChange が無効化され "paste" 固定
  // 完全版（full）: 貼付 / API をユーザがトグル可
  const [mode, setMode] = useState<Mode>("paste");
  const { ref: rootRef } = useStableSectionScroll(mode);
  // 保存は 要約 1 本のみ（Excel 出力時に見出しで 3 列へ分割）。
  // 旧データで構造化 3 フィールドだけが残っているケースでは、それを 1 本に整形して初期値に。
  const initialText = (() => {
    const t = initial?.要約 ?? "";
    if (t.trim()) return t;
    const s = {
      経歴: initial?.経歴 ?? "",
      主要スキル: initial?.主要スキル ?? "",
      強み: initial?.強み ?? "",
    };
    if (s.経歴 || s.主要スキル || s.強み) return formatStructuredSummary(s);
    return "";
  })();
  const [text, setText] = useState(initialText);
  const { save, isSaving, savedAt, setSavedAt, state } = useAutoSave();
  const lastSavedRef = useRef(initialText);
  useEffect(() => {
    setSavedAt(initial?.updatedAt ?? null);
  }, [initial?.updatedAt, setSavedAt]);
  const [llmOverride, setLlmOverride] = useState<ProviderModelOverride | undefined>(undefined);

  // API モード用（最大 2 ファイル: 履歴書 + 職務経歴書 等）
  const MAX_RESUME_FILES = 2;
  const [resumeFiles, setResumeFiles] = useState<{ file: File; kind: ResumeKind }[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * 旧 .xls (BIFF 形式) をブラウザ上で SheetJS を使い .xlsx に変換する。
   * サーバー側では ExcelJS しか動かないため、.xls はここで必ず変換してから送る。
   * SheetJS の CVE (Prototype Pollution / ReDoS) はブラウザサンドボックスに閉じ込める設計。
   */
  async function convertXlsToXlsx(file: File): Promise<File> {
    const XLSX = await import("xlsx");
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: "array" });
    const out = XLSX.write(wb, {
      bookType: "xlsx",
      type: "array",
    }) as ArrayBuffer;
    const newName = file.name.replace(/\.xls$/i, ".xlsx");
    return new File(
      [out],
      newName.toLowerCase().endsWith(".xlsx") ? newName : newName + ".xlsx",
      {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    );
  }

  async function handleAutoSave() {
    if (text === lastSavedRef.current) return;
    const snapshot = text;
    const ok = await save(() => saveCandidateAction(sessionId, mode, snapshot));
    if (ok) lastSavedRef.current = snapshot;
  }

  async function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0] ?? null;
    // input はクリック直後にリセット（同じファイルの再選択・別ファイルの追加を許可）
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!raw) return;

    if (resumeFiles.length >= MAX_RESUME_FILES) {
      setApiError(`履歴書ファイルは最大 ${MAX_RESUME_FILES} 個までです。`);
      return;
    }

    // 旧 .xls は先にブラウザ側で .xlsx に変換する
    let f: File = raw;
    if (isLegacyXls(raw.type, raw.name)) {
      setApiError(null);
      setConverting(true);
      try {
        f = await convertXlsToXlsx(raw);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        setApiError(
          `旧 .xls の変換に失敗しました。ファイルが破損しているか、対応外の形式の可能性があります。詳細: ${detail}`,
        );
        setConverting(false);
        return;
      } finally {
        setConverting(false);
      }
    }

    const kind = detectResumeKind(f.type, f.name);
    if (!kind) {
      setApiError(
        "対応していないファイル形式です。PDF / Word(.doc / .docx) / Excel(.xlsx / .xls) を選んでください。",
      );
      return;
    }
    // base64 で +33% 増えるため、Server Action の 5MB 制限に収まるよう 3.7MB を上限に
    const MAX_BYTES = 3.7 * 1024 * 1024;
    if (f.size > MAX_BYTES) {
      setApiError(
        `ファイルサイズが大きすぎます（${(f.size / 1024 / 1024).toFixed(1)} MB）。3.7 MB 以下にしてください。`,
      );
      return;
    }
    setApiError(null);
    setResumeFiles((prev) => [...prev, { file: f, kind }]);
  }

  function removeFile(idx: number) {
    setResumeFiles((prev) => prev.filter((_, i) => i !== idx));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSummarize() {
    setApiError(null);
    if (resumeFiles.length === 0 && !pasteText.trim()) {
      setApiError(
        "履歴書ファイル（PDF/Word/Excel）または貼付テキストのどちらかを指定してください。",
      );
      return;
    }
    setSummarizing(true);
    try {
      const filesPayload = await Promise.all(
        resumeFiles.map(async ({ file }) => ({
          base64: await fileToBase64(file),
          name: file.name,
          mime: file.type,
        })),
      );
      const res = await summarizeCandidateApiAction(
        sessionId,
        filesPayload,
        pasteText,
        llmOverride,
      );
      if (!res.ok) {
        setApiError(res.error ?? "要約に失敗しました。");
        return;
      }
      if (res.summary) {
        setText(res.summary);
        // API 要約は Server 側で saveCandidate 済み → クライアントの savedAt/last も同期
        lastSavedRef.current = res.summary;
        setSavedAt(new Date().toISOString());
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : String(e));
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div ref={rootRef}>
      <SectionHeaderBar title="① 面談者情報" hasData={!!initial?.要約}>
        <ModeSwitch mode={mode} onChange={setMode} apiLabel="API自動要約" />
        {isFull && mode === "api" && llmDefaults && (
          <ProviderModelSelect
            stage="summary"
            defaultProvider={llmDefaults.defaultProvider}
            defaultModel={llmDefaults.modelBy.summary}
            value={llmOverride}
            onChange={setLlmOverride}
            hasKey={llmDefaults.hasKey}
            disabled={summarizing || isSaving}
          />
        )}
      </SectionHeaderBar>

      {mode === "api" && (
        <div className="border rounded-lg p-3 mb-3 bg-muted space-y-3">
          <div className="text-xs text-muted-foreground">
            履歴書（<strong>PDF / Word(.doc / .docx) / Excel(.xlsx / .xls)</strong>）をアップロードするか、
            テキストを貼り付けて「要約する（API）」を押すと AI が経歴・スキル・強み・懸念点で要約します。
            <br />
            <span className="text-muted-foreground">
              ※ ファイルはサーバー側でテキスト抽出してから送信します（PDF の生バイナリは送りません）。
              旧 <code className="bg-card px-1 rounded border">.xls</code> はブラウザ内で自動的に <code className="bg-card px-1 rounded border">.xlsx</code> に変換されます。
            </span>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              履歴書ファイル（任意・最大 {MAX_RESUME_FILES} 個・履歴書 + 職務経歴書など・PDF / Word(.doc / .docx) / Excel(.xlsx / .xls)）
            </div>
            <div className="space-y-2">
              {resumeFiles.map((rf, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 text-xs text-foreground/85 bg-card border rounded px-2 py-1"
                >
                  <span className="text-muted-foreground opacity-70 tabular-nums w-4">{idx + 1}.</span>
                  <span className="truncate flex-1">
                    {kindIcon(rf.kind)} {rf.file.name}{" "}
                    <span className="pill pill-eval ml-1">{kindLabel(rf.kind)}</span>{" "}
                    <span className="text-muted-foreground opacity-70">({(rf.file.size / 1024).toFixed(1)} KB)</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(idx)}
                    className="text-red-600 hover:bg-red-50 text-xs"
                  >
                    取消
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2 flex-wrap">
                {resumeFiles.length < MAX_RESUME_FILES && (
                  <Button variant="outline" size="sm" asChild>
                    <label htmlFor="candidate-file-input" className="cursor-pointer">
                      📎 履歴書をアップ{resumeFiles.length > 0 ? `（${resumeFiles.length}/${MAX_RESUME_FILES}）` : ""}
                    </label>
                  </Button>
                )}
                <input
                  id="candidate-file-input"
                  ref={fileInputRef}
                  type="file"
                  accept={RESUME_FILE_ACCEPT}
                  className="hidden"
                  onChange={handlePickFile}
                />
                {converting && (
                  <span className="inline-flex items-center gap-1 text-xs text-blue-700">
                    <svg
                      className="w-3 h-3 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                    .xls をブラウザで .xlsx に変換中…
                  </span>
                )}
                {!converting && resumeFiles.length === 0 && (
                  <span className="text-xs text-muted-foreground opacity-70">未選択</span>
                )}
                {!converting && resumeFiles.length === MAX_RESUME_FILES && (
                  <span className="text-xs text-emerald-700">{MAX_RESUME_FILES} 個選択済（これ以上追加できません）</span>
                )}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1">
              貼付テキスト（ファイルが無いとき、または併用しない場合の代替）
            </div>
            <Textarea
              className="w-full text-sm bg-card"
              rows={4}
              placeholder="履歴書テキストを貼り付け（ファイルを選んだ場合は無視されます）"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={resumeFiles.length > 0}
            />
          </div>

          {apiError && (
            <div
              role="alert"
              aria-live="assertive"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2"
            >
              {apiError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing || isSaving || converting}
            >
              {summarizing ? "要約中…" : "要約する（API）"}
            </Button>
            <span className="text-xs text-muted-foreground">
              ※ 要約結果は下のテキスト欄に反映され、自動保存されます。
            </span>
          </div>
        </div>
      )}

      {mode === "paste" && (
        <MaxPromptCopy
          fetcher={() => buildSummaryPromptAction(sessionId)}
          hint={
            <>
              Max チャットで履歴書要約する場合：プロンプトをコピー → Max に貼付＋履歴書ファイル（PDF/Word/Excel）添付 → 結果を下のテキスト欄にペースト → 保存。
            </>
          }
          className="mb-2"
        />
      )}

      <div className="text-xs text-muted-foreground mb-1">要約</div>
      <div className="relative">
        <Textarea
          className="w-full text-sm leading-relaxed pr-3 pb-6"
          rows={14}
          placeholder={
            mode === "api"
              ? "API で要約するとここに反映されます。手で編集することもできます。"
              : "候補者の経歴要約を貼り付け"
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleAutoSave}
        />
        <AutoSaveIndicator state={state} />
      </div>
      <div className="text-xs text-muted-foreground opacity-70 mt-2">
        {savedAt
          ? `最終保存: ${new Date(savedAt).toLocaleString("ja-JP")}`
          : "未保存（テキスト欄からフォーカスを外すと自動保存）"}
      </div>
    </div>
  );
}
