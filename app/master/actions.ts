"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listRoles, saveRole, saveEvalCriteria } from "@/lib/storage";
import type { Role, EvalCriteria } from "@/lib/types";
import { writeAudit } from "@/lib/auditLog";

/**
 * マスタが空のときに使うサンプル初期データ。
 * pill 色（NW/Server/Dev/Special/PMO/ITSupport）に対応した 5 役割 + 5 軸の評価条件。
 * オンボーディング用途で 1 クリック投入。既存データがある場合は何もしない。
 */
export async function seedSampleMasterAction(): Promise<void> {
  const existing = listRoles();
  if (existing.length > 0) {
    // 既にロールがあるなら何もしない（うっかり実行防止）
    return;
  }

  const sampleRoles: Role[] = [
    {
      id: "NW",
      役割: "ネットワーク",
      経験: "3年以上",
      未経験可: false,
      条件1_基本人物像: [
        "手順書が無くても仮説を立てて動ける",
        "障害対応で落ち着いて切り分けができる",
        "顧客や関係者との折衝経験がある",
      ],
      条件2_未経験者必須: [],
    },
    {
      id: "Server",
      役割: "サーバ",
      経験: "2年以上",
      未経験可: false,
      条件1_基本人物像: [
        "Linux の運用経験がある",
        "自動化・IaC への関心がある",
        "夜間・障害対応の心構えがある",
      ],
      条件2_未経験者必須: [],
    },
    {
      id: "Dev",
      役割: "開発",
      経験: "1年以上",
      未経験可: true,
      条件1_基本人物像: [
        "自走してコードを書いた経験がある",
        "Git / PR ベースでの開発経験",
        "テストや設計に関心がある",
      ],
      条件2_未経験者必須: [
        "基本的なプログラミングの経験（学習でも可）",
        "PC / IDE の基本操作に不自由が無い",
      ],
    },
    {
      id: "PMO",
      役割: "プロジェクトマネジメント",
      経験: "5年以上",
      未経験可: false,
      条件1_基本人物像: [
        "進捗・リスク・課題管理の実務経験",
        "ステークホルダーとの折衝経験",
        "ドキュメント化・可視化が得意",
      ],
      条件2_未経験者必須: [],
    },
    {
      id: "ITSupport",
      役割: "ITサポート",
      経験: "1年以上",
      未経験可: true,
      条件1_基本人物像: [
        "利用者に寄り添う姿勢",
        "手順書に沿った対応ができる",
        "分からないことを質問できる",
      ],
      条件2_未経験者必須: [
        "PC の基本操作に不自由が無い",
        "簡単な英語の説明書きが読める",
      ],
    },
  ];

  for (const r of sampleRoles) {
    saveRole(r);
  }

  const sampleEval: EvalCriteria = {
    方式: "BARS",
    評価軸: [
      { 名前: "自己解決力", 重み: 4 },
      { 名前: "技術理解", 重み: 4 },
      { 名前: "コミュニケーション", 重み: 3 },
      { 名前: "業務経験", 重み: 3 },
      { 名前: "適応力・柔軟性", 重み: 3 },
    ],
    スケール: { 最小: 0, 最大: 5.0, 刻み: 0.5, 段階数: 11 },
    合格ライン: 4.2,
    普通ライン: 3.5,
    自己解決レベル: "0〜5の5段階で別途評価",
    出力: ["軸ごとのスコアと根拠", "総合スコア", "合否", "良い点", "懸念点"],
  };
  saveEvalCriteria(sampleEval);

  writeAudit("master.import", {
    meta: { source: "seedSample", roles: sampleRoles.length, axes: sampleEval.評価軸.length },
  });

  revalidatePath("/master");
  revalidatePath("/");
  redirect("/master");
}
