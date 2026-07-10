/**
 * 面談AI評価ツール — 共通型定義
 */

export type SessionStatus = "編集中" | "質問公開" | "面談済" | "評価済";
export type Result = "採用" | "不採用" | "未確定";
export type Mode = "paste" | "api";

/** master/roles/<id>.json — 役割別 求める人材条件マスタ */
export interface Role {
  id: string;
  役割: string;
  経験: string;
  未経験可: boolean;
  条件1_基本人物像: string[];
  条件2_未経験者必須: string[];
  /**
   * true のときこの役割は「編集不可」フラグが立つ。
   * - 新規セッション作成時に自動で ④凍結（`conditions_snapshot.json` を即時生成）
   * - セッション画面の「修正」ボタンは disabled 表示になり、ホバーで理由を表示
   * - 既存 JSON との後方互換のためオプショナル（未指定＝false）
   * - v1.x 時代の旧フィールド名 `ロック` からのリネーム。read 側で旧名は 編集不可 に畳み込む。
   */
  編集不可?: boolean;
}

/** 小軸（大分類配下の 1 項目）。重みは相対値で 1〜5 を想定（既定 3）。 */
export interface EvalSubAxis {
  名前: string;
  重み: number;
}

/**
 * 大分類（人間性 / 技術力）の中身。大分類自身には重みを持たない（表示グルーピングのみ）。
 * 総合スコアの算出は 6 小軸フラットの重み付き平均で行う。
 * 大分類スコア（表示用）は配下小軸の重み付き平均。
 */
export interface EvalCategoryData {
  小軸: EvalSubAxis[];
}

/** 大分類名（固定 2 種）。JSON key + 型分岐で使う。 */
export const CATEGORY_KEYS = ["人間性", "技術力"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/**
 * 役割別上書き。名前ベースの Map（大分類キー / 小軸名）で index 依存を避ける。
 * 大分類自体には重みを持たないため、上書き対象は 小軸重み と 合格/普通ライン のみ。
 */
export interface RoleEvalOverride {
  /** 小軸名 → 重み。マスタに存在しない小軸名は無視される。 */
  小軸重み?: Record<string, number>;
  合格ライン?: number;
  普通ライン?: number;
}

/** master/eval_criteria.json — BARS 評価条件マスタ。2 大分類固定（人間性 / 技術力）。 */
export interface EvalCriteria {
  方式: "BARS";
  人間性: EvalCategoryData;
  技術力: EvalCategoryData;
  スケール: { 最小: number; 最大: number; 刻み: number; 段階数: number };
  合格ライン: number;
  普通ライン: number;
  自己解決レベル: string;
  出力: string[];
  /** 役割 ID をキーにした役割別上書き。②凍結時に snapshot へ畳み込む。 */
  ロール別?: Record<string, RoleEvalOverride>;
}

/** sessions/<id>/session.json — 面談メタ（一覧表示・削除判定に使用） */
export interface SessionMeta {
  id: string;
  氏名: string;
  役割: string;
  作成日時: string;
  status: SessionStatus;
  closedAt: string | null;
  result: Result;
  hold: boolean;
  /**
   * 評価結果の総合スコアキャッシュ。⑧評価保存時に同時に書き込まれる。
   * 一覧描画で evaluation.json を毎件読まずに済むためのデノーマライズ列。
   * 旧データには存在しないため optional。読み出し側は未定義時に evaluation.json から
   * 読んで遅延バックフィルすることを推奨。
   */
  総合スコア?: number;
  /**
   * 評価結果の合否キャッシュ（合格 / 普通 / 不合格）。
   * 総合スコアと同じくデノーマライズ列。⑧評価保存時に一緒に書き込む。
   * 一覧の「合否列」（自動判定）を採否列（採用/不採用/未確定 = 手動判断）と別に
   * 表示するために使う。旧データには無いため optional、読み出し側で遅延バックフィル。
   */
  合否?: "合格" | "普通" | "不合格";
}

/** sessions/<id>/candidate.json — ② 面談者情報（要約テキスト） */
export interface Candidate {
  mode: Mode;
  /**
   * 統合要約テキスト。AI/貼付ともに常に保持。
   * 構造化フィールド（経歴/主要スキル/強み）が空の場合のフォールバック表示にも使う。
   */
  要約: string;
  updatedAt: string;
  /** ②要約を API モードで実行した場合のプロバイダ。貼付モードや旧データでは未設定 */
  provider?: ProviderId;
  /** 経歴サマリ（職歴・年数・主要案件）。AI が JSON で返した場合に設定 */
  経歴?: string;
  /** 主要スキル（技術・資格）。AI が JSON で返した場合に設定 */
  主要スキル?: string;
  /** 強み（具体例つき）。AI が JSON で返した場合に設定 */
  強み?: string;
}

/** sessions/<id>/conditions_snapshot.json — ④ 凍結された条件 */
export interface ConditionsSnapshot {
  role: Role;
  eval: EvalCriteria;
  frozenAt: string;
}

/** sessions/<id>/questions.json — ⑤ 質問リスト */
export interface QuestionItem {
  star: boolean;
  question: string;
  aim: string;
  example: string;
}
export interface Questions {
  mode: Mode;
  rawText: string;
  items: QuestionItem[];
  updatedAt: string;
}

/** sessions/<id>/minutes.json — ⑥ 面談内容 */
export interface Minutes {
  text: string;
  updatedAt: string;
  /** AI 要約で本文が置き換えられたかどうか（既定 false / 未設定 = 生の貼付） */
  summarized?: boolean;
}

/** sessions/<id>/evaluation.json — ⑤ 評価結果（大分類 × 小軸の 2 段構造） */
export interface SubAxisEvaluation {
  軸: string;
  スコア: number;
  根拠: string;
}
export interface CategoryEvaluation {
  /** 大分類スコア（小軸の重み付き平均。サーバ側で自動算出） */
  スコア: number;
  小軸評価: SubAxisEvaluation[];
}
export interface Evaluation {
  mode: Mode;
  人間性: CategoryEvaluation;
  技術力: CategoryEvaluation;
  自己解決レベル: number;
  /** 大分類スコアの重み付き平均。サーバ側で自動算出 */
  総合スコア: number;
  合否: "合格" | "普通" | "不合格";
  良い点: string;
  懸念点: string;
  updatedAt: string;
  /** ⑤評価を API モードで実行した場合のプロバイダ。貼付モードでは未設定 */
  provider?: ProviderId;
}

/** 対応 LLM プロバイダ */
export type ProviderId = "anthropic" | "openai" | "google";

/** 工程キー（②要約 / ⑤質問 / ⑧評価 / ⑧厳格時） */
export type LlmStage = "summary" | "questions" | "evaluation" | "evaluationStrict";

/** プロバイダごとの設定（キー + 既定モデル + 工程別モデル） */
export interface ProviderConfig {
  /** ローカルファイル保存のキー。空 = 未設定（環境変数で代用可） */
  key: string;
  /** プロバイダの既定モデル。工程別モデルが空の場合のフォールバック */
  defaultModel: string;
  /** 工程別モデル（プロバイダ内での上書き）。未指定 = defaultModel を使う */
  models: Partial<Record<LlmStage, string>>;
}

/**
 * Client Component に渡してよい安全な抜粋。
 * `ProviderConfig.key` をそのまま渡すと RSC payload にキー文字列が乗ってしまうため、
 * Server Component 側で boolean + モデル名にだけ詰め替えてから渡すこと。
 */
export interface ProviderSafeStatus {
  /** ローカル保存のキーが入っているか */
  hasFileKey: boolean;
  /** UI 表示用の既定モデル */
  defaultModel: string;
}

/** ⑤質問生成時の問数設定。prompt 文と maxTokens が両方この値から動的に決まる。 */
export interface QuestionCounts {
  /** 人間性質問の数（既定 7） */
  nontech: number;
  /** 技術質問の数（既定 8） */
  tech: number;
}

/** data/settings.json */
export interface Settings {
  dataRoot: string;
  /** どのプロバイダを既定にするか（②⑤⑧ で override されなければこれが使われる） */
  defaultProvider: ProviderId;
  /** プロバイダごとの設定 */
  providers: Record<ProviderId, ProviderConfig>;
  /**
   * @deprecated 旧 v1.4 までの形式。loadSettings 側で providers.anthropic にマージする。
   * 直接参照しないこと。
   */
  api?: { key: string; defaultModel: string };
  /** ⑤質問生成の問数（未設定なら 7 + 8 = 15問の既定） */
  questionCounts: QuestionCounts;
  retention: {
    enabled: boolean;
    anchor: "closedAt";
    days: Record<string, number>;
    softDeleteGraceDays: number;
    keepAnonymizedEval: boolean;
    /** バックアップ世代を何日残すか。省略時 90。0 = 自動削除しない。 */
    backupKeepDays?: number;
    /** バックアップ世代を何件残すか。省略時 0 = 無制限。 */
    backupMaxGenerations?: number;
  };
}
