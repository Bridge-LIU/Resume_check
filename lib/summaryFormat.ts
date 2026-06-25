/**
 * 履歴書要約の「構造化 3 フィールド ⇔ 単一テキスト」変換ユーティリティ。
 * UI 側では 1 つの textarea で編集する一方、保存・Excel ミラーは
 * 経歴 / 主要スキル / 強み の 3 フィールドに分けて持つ。
 *
 * Client / Server 両方から import 可（server-only 禁止）。
 */

export interface StructuredSummary {
  経歴: string;
  主要スキル: string;
  強み: string;
}

const HEADERS = {
  経歴: "■ 経歴サマリ（職種・年数・主要案件）",
  主要スキル: "■ 主要スキル（技術・資格・ツール）",
  強み: "■ 強み（具体例つき 2〜3 点）",
} as const;

/** 3 フィールドを 1 本のテキストへ整形（空欄セクションも見出しは残す） */
export function formatStructuredSummary(s: StructuredSummary): string {
  return [
    `${HEADERS.経歴}\n${s.経歴.trim()}`,
    `${HEADERS.主要スキル}\n${s.主要スキル.trim()}`,
    `${HEADERS.強み}\n${s.強み.trim()}`,
  ].join("\n\n");
}

/**
 * 1 本のテキストを 3 フィールドへ分割。
 * 見出し検出は緩め：「経歴」「経歴サマリ」「職歴」「保有スキル」「主要スキル」「スキル」「強み」
 * 先頭の #+ / 数字 . / - / ■ などは無視。
 * 見出しが 1 つも無ければ全文を 経歴 に入れる。
 */
export function parseStructuredSummary(text: string): StructuredSummary {
  const result: StructuredSummary = { 経歴: "", 主要スキル: "", 強み: "" };
  const t = text.trim();
  if (!t) return result;

  const buckets: Record<"career" | "skills" | "strengths" | "other", string[]> = {
    career: [],
    skills: [],
    strengths: [],
    other: [],
  };
  let current: keyof typeof buckets = "other";
  let sawHeader = false;

  const headerRe =
    /^\s*(?:[■#＃]+\s*|\d+[.)]\s*|[-*]\s*)?(経歴サマリ|経歴|職歴|保有スキル|主要スキル|スキル|強み|懸念点|懸念)(?:\s*[（(][^）)]*[）)])?\s*[：:]?\s*$/;

  for (const line of t.split(/\r?\n/)) {
    const m = line.match(headerRe);
    if (m) {
      sawHeader = true;
      const key = m[1];
      if (key === "強み") current = "strengths";
      else if (key === "保有スキル" || key === "主要スキル" || key === "スキル")
        current = "skills";
      else if (key === "懸念" || key === "懸念点") current = "other";
      else current = "career";
      continue;
    }
    buckets[current].push(line);
  }

  if (!sawHeader) {
    result.経歴 = t;
    return result;
  }

  const join = (arr: string[]) =>
    arr.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  result.経歴 = join(buckets.career);
  result.主要スキル = join(buckets.skills);
  result.強み = join(buckets.strengths);
  return result;
}
