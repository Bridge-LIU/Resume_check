"use client";

import { useRef, useState, useTransition } from "react";
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
import { useStableSectionScroll } from "./useStableSectionScroll";
import type { LlmDefaults } from "../page";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  detectResumeKind,
  kindIcon,
  kindLabel,
  RESUME_FILE_ACCEPT,
  type ResumeKind,
} from "@/lib/resumeKind";
import { formatStructuredSummary } from "@/lib/summaryFormat";

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
  llmDefaults: LlmDefaults;
}) {
  const [mode, setMode] = useState<Mode>(initial?.mode ?? "paste");
  const { ref: rootRef, capture: captureScroll } = useStableSectionScroll(mode);
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
  const [savedAt, setSavedAt] = useState<string | null>(
    initial?.updatedAt ?? null,
  );
  const [isPending, startTransition] = useTransition();
  const [llmOverride, setLlmOverride] = useState<ProviderModelOverride | undefined>(undefined);

  // API モード用
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [resumeKind, setResumeKind] = useState<ResumeKind | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    startTransition(async () => {
      await saveCandidateAction(sessionId, mode, text);
      setSavedAt(new Date().toISOString());
    });
  }

  function handlePickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) {
      setResumeFile(null);
      setResumeKind(null);
      return;
    }
    const kind = detectResumeKind(f.type, f.name);
    if (!kind) {
      setApiError(
        "対応していないファイル形式です。PDF / Word(.docx) / Excel(.xlsx / .xls) を選んでください。",
      );
      setResumeFile(null);
      setResumeKind(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    // base64 で +33% 増えるため、Server Action の 5MB 制限に収まるよう 3.7MB を上限に
    const MAX_BYTES = 3.7 * 1024 * 1024;
    if (f.size > MAX_BYTES) {
      setApiError(
        `ファイルサイズが大きすぎます（${(f.size / 1024 / 1024).toFixed(1)} MB）。3.7 MB 以下にしてください。`,
      );
      setResumeFile(null);
      setResumeKind(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setApiError(null);
    setResumeFile(f);
    setResumeKind(kind);
  }

  function clearFile() {
    setResumeFile(null);
    setResumeKind(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleSummarize() {
    setApiError(null);
    if (!resumeFile && !pasteText.trim()) {
      setApiError(
        "履歴書ファイル（PDF/Word/Excel）または貼付テキストのどちらかを指定してください。",
      );
      return;
    }
    setSummarizing(true);
    try {
      const fileBase64 = resumeFile ? await fileToBase64(resumeFile) : null;
      const res = await summarizeCandidateApiAction(
        sessionId,
        fileBase64,
        resumeFile?.name ?? null,
        resumeFile?.type ?? null,
        pasteText,
        llmOverride,
      );
      if (!res.ok) {
        setApiError(res.error ?? "要約に失敗しました。");
        return;
      }
      if (res.summary) {
        setText(res.summary);
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
      <div className="flex items-center justify-between mb-2 gap-2 min-h-8">
        <h3 className="font-bold whitespace-nowrap">② 面談者情報</h3>
        <div className="flex items-center gap-2 flex-nowrap min-w-0">
          <ModeSwitch
            mode={mode}
            onChange={(m) => {
              captureScroll();
              setMode(m);
            }}
            apiLabel="API自動要約"
            apiEnabled
          />
          {mode === "api" && (
            <ProviderModelSelect
              stage="summary"
              defaultProvider={llmDefaults.defaultProvider}
              defaultModel={llmDefaults.modelBy.summary}
              value={llmOverride}
              onChange={setLlmOverride}
              hasKey={llmDefaults.hasKey}
              disabled={summarizing || isPending}
            />
          )}
        </div>
      </div>

      {mode === "api" && (
        <div className="border rounded-lg p-3 mb-3 bg-zinc-50 space-y-3">
          <div className="text-xs text-zinc-600">
            履歴書（<strong>PDF / Word(.docx) / Excel(.xlsx / .xls)</strong>）をアップロードするか、
            テキストを貼り付けて「要約する（API）」を押すと AI が経歴・スキル・強み・懸念点で要約します。
            <br />
            <span className="text-zinc-500">
              ※ ファイルはサーバー側でテキスト抽出してから送信します（PDF の生バイナリは送りません）。
            </span>
          </div>

          <div>
            <div className="text-xs text-zinc-500 mb-1">
              履歴書ファイル（任意・PDF / Word / Excel）
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" asChild>
                <label htmlFor="candidate-file-input" className="cursor-pointer">
                  📎 履歴書をアップ
                </label>
              </Button>
              <input
                id="candidate-file-input"
                ref={fileInputRef}
                type="file"
                accept={RESUME_FILE_ACCEPT}
                className="hidden"
                onChange={handlePickFile}
              />
              {resumeFile && resumeKind && (
                <>
                  <span className="text-xs text-zinc-700 truncate max-w-xs">
                    {kindIcon(resumeKind)} {resumeFile.name}{" "}
                    <span className="pill pill-eval ml-1 text-[10px]">
                      {kindLabel(resumeKind)}
                    </span>{" "}
                    <span className="text-zinc-400">
                      ({(resumeFile.size / 1024).toFixed(1)} KB)
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    className="text-red-600 hover:bg-red-50 text-xs"
                  >
                    取消
                  </Button>
                </>
              )}
              {!resumeFile && (
                <span className="text-xs text-zinc-400">未選択</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-xs text-zinc-500 mb-1">
              貼付テキスト（ファイルが無いとき、または併用しない場合の代替）
            </div>
            <Textarea
              className="w-full text-sm bg-white"
              rows={4}
              placeholder="履歴書テキストを貼り付け（ファイルを選んだ場合は無視されます）"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              disabled={!!resumeFile}
            />
          </div>

          {apiError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {apiError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              type="button"
              onClick={handleSummarize}
              disabled={summarizing || isPending}
            >
              {summarizing ? "要約中…" : "要約する（API）"}
            </Button>
            <span className="text-xs text-zinc-500">
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

      <div className="text-xs text-zinc-500 mb-1">要約</div>
      <Textarea
        className="w-full text-sm leading-relaxed"
        rows={14}
        placeholder={
          mode === "api"
            ? "API で要約するとここに反映されます。手で編集することもできます。"
            : "候補者の経歴要約を貼り付け"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="text-[11px] text-zinc-400 mt-1">
        ※ Excel 出力時、「経歴サマリ」「主要スキル」「強み」の見出しで 3 列に自動分割されます。
      </div>
      <div className="flex items-center gap-3 mt-2">
        <Button
          type="button"
          onClick={handleSave}
          disabled={isPending || summarizing}
        >
          {isPending ? "保存中…" : "保存"}
        </Button>
        {savedAt && (
          <span className="text-xs text-zinc-500">
            最終保存: {new Date(savedAt).toLocaleString("ja-JP")}
          </span>
        )}
      </div>
    </div>
  );
}
