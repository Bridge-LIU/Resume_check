/**
 * UI トークン / 色マップ集約。
 * 従来 sessions/[id]/page.tsx, SessionListTable, analytics, compare, list, home に
 * それぞれ role/status/verdict のクラスマップが散らばっていたのを一箇所へ。
 * 全ページで同じ意味 → 同じ色に統一する（監査で指摘された不整合の解消）。
 */

/* ────────────────────────────────
 *  状態（SessionStatus）
 * ──────────────────────────────── */

export const STATUS_CARD_BG: Record<
  "edit" | "qpub" | "itv" | "eval",
  string
> = {
  edit: "bg-zinc-500",
  qpub: "bg-amber-400",
  itv: "bg-violet-500",
  eval: "bg-blue-500",
};

// ホームの「最近の活動」でカードとリンクさせるドット色。pill と同系。
export const STATUS_DOT: Record<string, string> = {
  編集中: "bg-zinc-400",
  質問公開: "bg-amber-500",
  面談済: "bg-violet-500",
  評価済: "bg-blue-500",
};

// 色だけに頼らないためのアイコン併記（a11y）
export const STATUS_ICON: Record<string, string> = {
  編集中: "✏️",
  質問公開: "📤",
  面談済: "🎤",
  評価済: "📝",
};

export function statusPillClass(status: string): string {
  switch (status) {
    case "編集中":
      return "pill pill-edit";
    case "質問公開":
      return "pill pill-qpub";
    case "面談済":
      return "pill pill-itv";
    case "評価済":
      return "pill pill-eval";
    default:
      return "pill pill-edit";
  }
}

/* ────────────────────────────────
 *  合否（自動判定）+ 採否（人手判断）
 *  合格 / 採用 は同じ emerald、不合格 / 不採用 は同じ rose。
 *  意味の差はアイコン（👍 vs 🎉 / 👎 vs 🚫）で表現する。
 * ──────────────────────────────── */

export const VERDICT_CARD_BG: Record<"pass" | "fail", string> = {
  pass: "bg-emerald-500",
  fail: "bg-rose-500",
};

export const RESULT_CARD_BG: Record<"hired" | "reject", string> = {
  hired: "bg-emerald-500",
  reject: "bg-rose-500",
};

export function verdictPillClass(v: string | undefined | null): string | null {
  if (v === "合格") return "pill pill-pass";
  if (v === "普通") return "pill pill-mid";
  if (v === "不合格") return "pill pill-fail";
  return null;
}

/* ────────────────────────────────
 *  役割 pill
 * ──────────────────────────────── */

export const ROLE_PILL_MAP: Record<string, string> = {
  NW: "pill-role-nw",
  Server: "pill-role-sv",
  Dev: "pill-role-dev",
  Special: "pill-role-sp",
  PMO: "pill-role-pm",
  ITSupport: "pill-role-it",
};

export function rolePillClass(役割: string): string {
  if (ROLE_PILL_MAP[役割]) return `pill ${ROLE_PILL_MAP[役割]}`;
  if (役割.startsWith("NW")) return "pill pill-role-nw";
  if (役割.startsWith("Dev") || 役割.startsWith("開発")) return "pill pill-role-dev";
  if (役割.startsWith("Server")) return "pill pill-role-sv";
  if (役割.startsWith("Special")) return "pill pill-role-sp";
  if (役割.startsWith("PMO")) return "pill pill-role-pm";
  if (役割.startsWith("IT")) return "pill pill-role-it";
  return "pill bg-zinc-100 text-zinc-700";
}

/* ────────────────────────────────
 *  評価バー・スコア色（analytics / evaluation / compare 共通）
 * ──────────────────────────────── */

export function scoreBarColor(score: number): string {
  if (score >= 4.2) return "bg-emerald-500";
  if (score >= 3.5) return "bg-amber-500";
  return "bg-rose-500";
}
