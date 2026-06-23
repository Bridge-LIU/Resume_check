/**
 * ⑤ 質問リストの構造化パーサー（設計書 §5 ⑤）
 *
 * rawText（⭐/狙い/解答例 のテキスト形式）と QuestionItem[]（構造化配列）の双方向変換。
 *
 * サポートする入力フォーマット:
 *   ## 非技術 / ## 技術 のセクション見出し（任意）
 *   ⭐ Q1. 質問本文   ← または ☆ Q1. / Q1. / T1. / 1. / １. などの開始パターン
 *     狙い: ...     ← または 狙: / aim: などの揺れ吸収（行頭インデント無くてもOK）
 *     解答例: ...   ← または 解: / example: などの揺れ吸収
 *
 * 設計目標:
 *   - Max が多少フォーマットを崩しても極力拾う
 *   - ⭐ や Q1./T1. の番号付けは復元時に再付番する
 *   - セクション情報（非技術/技術）は category として保持
 */

// 注: pure な変換関数のため client / server どちらからでも import 可。
import type { QuestionItem } from "./types";

/** QuestionItem に追加でカテゴリ情報を載せた拡張型（内部用） */
export interface ParsedQuestionItem extends QuestionItem {
  /** 非技術 / 技術 / その他 */
  category: "非技術" | "技術" | "その他";
}

const NON_TECH_HEADER_RE = /^##\s*非技術\s*$/m;
const TECH_HEADER_RE = /^##\s*技術\s*$/m;

/** 質問開始行: ⭐/☆ + Q/T/数字 + . */
const QUESTION_START_RE =
  /^\s*(⭐|☆)?\s*(?:Q|T|[1-9０-９]\d?)?\s*[.．。]?\s*(.*)$/;

/** 行頭が「狙い:」 / 「狙:」 / 「aim:」（前後の空白・インデント許容） */
const AIM_RE = /^\s*(?:狙い|狙|aim)\s*[:：]\s*(.*)$/i;
/** 行頭が「解答例:」 / 「解:」 / 「example:」 */
const EXAMPLE_RE = /^\s*(?:解答例|解|example)\s*[:：]\s*(.*)$/i;

/** "⭐ Q1. ", "Q1.", "T2. ", "1.", "１．", "☆ 3." などを検出 */
function detectQuestionLine(line: string): { star: boolean; body: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  // 「狙い:」「解答例:」で始まる行は質問開始ではない
  if (AIM_RE.test(trimmed) || EXAMPLE_RE.test(trimmed)) return null;
  // ⭐ / ☆ プレフィックス
  let star = false;
  let rest = trimmed;
  if (/^[⭐☆]/.test(rest)) {
    star = true;
    rest = rest.replace(/^[⭐☆]\s*/, "");
  }
  // Q1. / T1. / Q1: / 1. / １．
  const m = rest.match(/^(?:Q|T|q|t)?\s*([1-9０-９]\d?)\s*[.．。:：]\s*(.+)$/);
  if (m && m[2].trim()) {
    return { star, body: m[2].trim() };
  }
  // 上の形式じゃないけど ⭐ がついてる場合は星付きの質問とみなす
  if (star && rest) {
    return { star, body: rest };
  }
  return null;
}

/** rawText → 構造化された QuestionItem 配列（カテゴリ別） */
export function parseQuestions(rawText: string): {
  nonTech: ParsedQuestionItem[];
  tech: ParsedQuestionItem[];
} {
  const lines = rawText.split(/\r?\n/);

  // セクション境界を見つける
  let currentCategory: "非技術" | "技術" | "その他" = "非技術"; // 見出し無しなら全部非技術扱い
  const nonTech: ParsedQuestionItem[] = [];
  const tech: ParsedQuestionItem[] = [];

  // セクション見出しが少なくとも 1 個でも存在するか
  const hasNonHeader = NON_TECH_HEADER_RE.test(rawText);
  const hasTechHeader = TECH_HEADER_RE.test(rawText);
  // 見出し無しなら最初のグループの category を一旦 "その他" にしておく（後で全部 nonTech に入れる）
  if (!hasNonHeader && !hasTechHeader) {
    currentCategory = "その他";
  }

  let cur: ParsedQuestionItem | null = null;

  function commit() {
    if (!cur) return;
    cur.question = cur.question.trim();
    cur.aim = cur.aim.trim();
    cur.example = cur.example.trim();
    if (!cur.question) return; // 空質問は捨てる
    const bucket =
      cur.category === "技術"
        ? tech
        : cur.category === "非技術"
          ? nonTech
          : nonTech; // "その他"（見出し無し）も nonTech へ
    bucket.push(cur);
  }

  for (const raw of lines) {
    const line = raw;
    // セクション見出し検知
    if (/^##\s*非技術\s*$/.test(line.trim())) {
      commit();
      cur = null;
      currentCategory = "非技術";
      continue;
    }
    if (/^##\s*技術\s*$/.test(line.trim())) {
      commit();
      cur = null;
      currentCategory = "技術";
      continue;
    }

    // 狙い / 解答例（先に評価して質問開始と誤判定しないように）
    const aimMatch = line.match(AIM_RE);
    if (aimMatch && cur) {
      cur.aim = (cur.aim ? cur.aim + " " : "") + aimMatch[1].trim();
      continue;
    }
    const exMatch = line.match(EXAMPLE_RE);
    if (exMatch && cur) {
      cur.example = (cur.example ? cur.example + " " : "") + exMatch[1].trim();
      continue;
    }

    // 質問開始（行頭インデント無しの行のみが質問開始候補）
    const qMatch = detectQuestionLine(line);
    if (qMatch && !line.startsWith("  ") && !line.startsWith("\t")) {
      commit();
      cur = {
        star: qMatch.star,
        question: qMatch.body,
        aim: "",
        example: "",
        category: currentCategory,
      };
      continue;
    }

    // それ以外で cur があれば、直前要素の継続（question 本文か aim/example の続き）
    if (cur && line.trim()) {
      // 行が aim/example の改行継続っぽければそちらに、それ以外は question に追加
      if (cur.example) {
        cur.example += " " + line.trim();
      } else if (cur.aim) {
        cur.aim += " " + line.trim();
      } else {
        cur.question += " " + line.trim();
      }
    }
  }
  commit();

  return { nonTech, tech };
}

/** QuestionItem[] → rawText（保存形式）。番号は再付番。category=非技術/技術 のヘッダを出す */
export function stringifyQuestions(
  nonTech: QuestionItem[],
  tech: QuestionItem[],
): string {
  const parts: string[] = [];

  function format(items: QuestionItem[], prefix: "Q" | "T"): string {
    return items
      .map((q, i) => {
        const star = q.star ? "⭐ " : "";
        const body = `${star}${prefix}${i + 1}. ${q.question.trim()}`;
        const lines = [body];
        if (q.aim.trim()) lines.push(`  狙い: ${q.aim.trim()}`);
        if (q.example.trim()) lines.push(`  解答例: ${q.example.trim()}`);
        return lines.join("\n");
      })
      .join("\n\n");
  }

  if (nonTech.length > 0) {
    parts.push("## 非技術");
    parts.push(format(nonTech, "Q"));
  }
  if (tech.length > 0) {
    if (parts.length > 0) parts.push("");
    parts.push("## 技術");
    parts.push(format(tech, "T"));
  }
  return parts.join("\n") + (parts.length > 0 ? "\n" : "");
}

/** 全 items（非技術 + 技術）を 1 つの配列に圧縮（保存用）。category は捨てる */
export function flattenToItems(
  nonTech: QuestionItem[],
  tech: QuestionItem[],
): QuestionItem[] {
  return [...nonTech, ...tech];
}
