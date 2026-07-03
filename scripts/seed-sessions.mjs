/**
 * data/sessions/ にリアルな面談レコードを N 件生成する。
 * 使い方: node scripts/seed-sessions.mjs [件数=20]
 *
 * プロジェクト実装の以下プロンプトに準拠したフォーマットで生成:
 *   - ②要約: buildSummaryPromptAction (経歴サマリ/保有スキル/強み/懸念)
 *   - ⑤質問: buildQuestionsSystemPrompt (## 非技術 7問 + ## 技術 8問, ⭐/狙い/解答例)
 *   - ⑧評価: EVAL_OUTPUT_SCHEMA ({軸評価,自己解決レベル,総合スコア,合否,良い点,懸念点})
 *
 * 分布:
 *   status: 評価済 65% / 面談済 15% / 質問公開 10% / 編集中 10%
 *   評価プロファイル: high 30% / mid 50% / low 20%
 *     → 合格 ~30% / 普通 ~45% / 不合格 ~25%
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SESSIONS = path.join(DATA, "sessions");
const ROLES_DIR = path.join(DATA, "master", "roles");
const EVAL_PATH = path.join(DATA, "master", "eval_criteria.json");

const argCount = Number.parseInt(process.argv[2] ?? "20", 10);
const COUNT = Number.isFinite(argCount) && argCount > 0 ? argCount : 20;

// ─────────────────── 名前候補 ───────────────────
const SURNAMES = [
  "佐藤","鈴木","高橋","田中","伊藤","渡辺","山本","中村","小林","加藤",
  "吉田","山田","佐々木","山口","松本","井上","木村","林","清水","斎藤",
  "森","池田","橋本","石川","前田","藤田","岡田","後藤","長谷川","石井",
];
const GIVEN_M = [
  "翔太","大輔","健一","雄大","拓海","涼","陸","悠斗","颯","蓮",
  "亮介","恭平","隼人","慎也","智久","貴志","洋平","裕介","雅也","龍太",
];
const GIVEN_F = [
  "美咲","彩香","結衣","真由","優花","舞","菜々子","愛","陽菜","杏奈",
  "麻衣","千夏","彩乃","佳奈","理沙","智子","恵理","美穂","綾","桃子",
];

// ─────────────────── 経歴テンプレ ───────────────────
const CAREER_BY_ROLE = {
  NW: [
    { yrs: [5,8], text: "SIer で ${y} 年、Cisco/YAMAHA ルータ・Catalyst スイッチの詳細設計・構築を担当。CCNP R&S 保持。金融機関の WAN 更改案件でパラメータシートと Config 作成を主導。夜間切替も含めて 20 拠点以上の実機投入経験あり。" },
    { yrs: [3,6], text: "通信キャリアで ${y} 年、法人向け WAN の設計〜切替を担当。BGP フルルート受け取り拠点の設計、FortiGate クラスタ導入、Palo Alto Panorama 集中管理経験。CCIE R&S 学習中。" },
    { yrs: [6,10], text: "MSP で ${y} 年、L2/L3 スイッチ・FW（Palo Alto/FortiGate）の構築運用を年間 30 件以上経験。夜間・休日メンテナンス実績多数、パケットキャプチャによる障害切り分けが得意。" },
  ],
  Server: [
    { yrs: [4,7], text: "SaaS スタートアップで ${y} 年、AWS 上のマイクロサービス基盤（EKS / RDS / SQS）を運用。IaC は Terraform、監視は Datadog。SRE ロールで SLO 設計から実装まで担当。" },
    { yrs: [3,6], text: "SIer で ${y} 年、オンプレ Linux（RHEL7/8）+ Oracle 12c/19c の構築から Azure 移行 PoC まで担当。Ansible で構築自動化。夜間パッチ適用と定期メンテのシフト経験。" },
    { yrs: [5,8], text: "自社開発企業で ${y} 年、Nginx + PostgreSQL + Docker Compose の中規模サービスをワンオペ運用。Zabbix 監視、Prometheus 移行、Grafana でのダッシュボード整備までを 1 人で担当。" },
  ],
  Dev: [
    { yrs: [4,7], text: "自社 SaaS で ${y} 年、TypeScript + React + Node.js のフルスタック開発。設計から運用まで 3 名チームで担当。テックリードとしてコード規約整備・PR レビュー基準策定を主導。" },
    { yrs: [5,10], text: "SIer で ${y} 年、Java + Spring Boot の業務系 Web を要件定義から一貫担当。近年は Kubernetes 上へのマイグレーション PoC も手がけ、gRPC でのサービス分割を経験。" },
    { yrs: [3,5], text: "受託開発で ${y} 年、Ruby on Rails + Vue.js の Web サービスを 5 件立ち上げ。GitHub Actions での CI/CD 整備、E2E テスト (Playwright) 導入実績あり。" },
  ],
  PMO: [
    { yrs: [4,7], text: "コンサルで ${y} 年、SIer 案件の進捗管理・EVM・課題管理を担当。10〜30 名規模の PMO を 4 案件経験。PMP 保持、リスクレジスタ運用の標準化実績あり。" },
    { yrs: [6,10], text: "SIer で ${y} 年、大規模案件（50〜100 名）の全社横断 PMO として品質・進捗の可視化を主導。ステアリングコミッティ運営、経営層向けレポート作成の経験多数。" },
    { yrs: [3,5], text: "自社サービスで ${y} 年、開発チームのスクラムマスター 兼 PMO。Jira / Confluence 運用整備、スプリントメトリクスの可視化、ベロシティ改善実績あり。" },
  ],
  ITSupport: [
    { yrs: [3,6], text: "社内 IT 部門で ${y} 年、社員 500 名規模の PC キッティング・Active Directory 運用・Microsoft 365 サポートを担当。ITIL v3 Foundation 保持、Intune 移行 PoC 参画。" },
    { yrs: [4,8], text: "ヘルプデスクで ${y} 年、社員 800 名規模の 1 次受付と障害切り分け。SLA 管理、FAQ ナレッジ整備、月次レポートを担当。" },
    { yrs: [3,5], text: "MSP で ${y} 年、複数顧客の運用監視と障害初動対応を経験。夜間シフト実績多数、Zabbix 監視・障害エスカレーション手順の標準化に携わる。" },
  ],
  Special: [
    { yrs: [5,10], text: "業務委託で ${y} 年、多業界の PoC 案件を短期リード。Python + SQL でのデータ整形、Tableau/PowerBI での可視化、Excel VBA での業務自動化を横断的に活用。" },
    { yrs: [4,7], text: "コンサルで ${y} 年、業務分析・要件定義から実装まで一貫。データ分析（Tableau / PowerBI）、業務プロセス改善、RPA (UiPath) 導入経験あり。" },
    { yrs: [3,6], text: "スタートアップ 2 社で ${y} 年、初期メンバとしてバックオフィス〜プロダクトを横断。何でも屋として組織立ち上げの基盤作りを担当。" },
  ],
};

// ─────────────────── 質問 ───────────────────
// 短時間面談を想定: 非技術 5 + 技術 5 = 10 問
const NONTECH_QUESTIONS = [
  { star: true,  n: "Q1", question: "自己紹介と直近の役割を 1〜2 分でお願いします。", aim: "コミュニケーション / 論理性", example: "現職の役割・チーム規模・具体的な成果を簡潔に構造化して説明" },
  { star: true,  n: "Q3", question: "これまでに自ら提案して改善した事例を、状況・行動・結果の順で教えてください。", aim: "主体性 / 影響力", example: "業務改善・新規施策・後輩指導など、自発的な行動と定量的な成果" },
  { star: false, n: "Q5", question: "うまくいかなかった経験と、そこから学んだことを教えてください。", aim: "内省 / 柔軟性", example: "失敗を率直に振り返り、次回の行動変容につなげた事例" },
  { star: false, n: "Q6", question: "ストレスがかかる場面での自分なりの対処法は？", aim: "セルフマネジメント", example: "業務に支障が出ない範囲での具体的な対処法" },
  { star: true,  n: "Q7", question: "なぜ弊社/この職種を志望されるのですか？", aim: "志望動機 / 定着性", example: "具体的な魅力ポイントと、自身のキャリアプランとの結びつき" },
];

const TECH_QUESTIONS_BY_ROLE = {
  NW: [
    { star: true,  n: "T1", question: "OSPF と BGP の使い分け基準を、実案件の例で説明してください。", aim: "問題解決力 / 技術理解", example: "エリア設計・AS 境界・拠点間ポリシーの観点" },
    { star: true,  n: "T3", question: "本番 NW で発生した障害の切り分け手順を、直近の実例で説明してください。", aim: "障害対応力", example: "疎通確認 → ログ確認 → packet capture → 原因特定 → 恒久対策" },
    { star: false, n: "T5", question: "クラウド NW（AWS VPC / Azure VNet）と、オンプレ NW との違いで最初に意識するのは？", aim: "クラウド適応力", example: "セキュリティグループ・ルートテーブル・PrivateLink 等" },
    { star: false, n: "T6", question: "Cisco と YAMAHA を扱った経験の違いを教えてください。", aim: "経験の幅", example: "コマンド体系・GUI 有無・運用しやすさの実感" },
    { star: true,  n: "T7", question: "夜間切替作業で必ず徹底していることは？", aim: "運用堅牢性", example: "手順書・切り戻し条件・立会体制・ロールバック期限" },
  ],
  Server: [
    { star: true,  n: "T1", question: "Linux サーバの負荷が高い時の切り分け手順を教えてください。", aim: "問題解決力", example: "top/vmstat/iostat → 特定プロセス → strace/perf → 原因" },
    { star: true,  n: "T3", question: "Terraform / Ansible で構築自動化した経験と、そこでの設計判断を教えてください。", aim: "IaC 設計力", example: "モジュール分割・state 管理・変更適用ワークフロー" },
    { star: false, n: "T5", question: "監視設計で意識するポイントは？アラート設計の失敗談も。", aim: "監視設計", example: "SLI/SLO・閾値・ノイズ削減・オンコール負荷" },
    { star: true,  n: "T6", question: "セキュリティパッチ適用の運用フローを教えてください。", aim: "運用堅牢性", example: "検証環境・停止調整・切り戻し手順・週次サイクル" },
    { star: false, n: "T7", question: "AWS / Azure / GCP のいずれかで、本番運用中に困った経験を教えてください。", aim: "クラウド運用", example: "コスト・権限設計・可用性設計の実経験" },
  ],
  Dev: [
    { star: true,  n: "T1", question: "直近で関わったプロジェクトのアーキテクチャを 1 分で説明してください。", aim: "設計力 / 整理力", example: "モジュール構成・依存関係・採用技術の意図" },
    { star: true,  n: "T3", question: "パフォーマンス問題を解決した具体例を、原因特定から対策まで教えてください。", aim: "問題解決力", example: "プロファイリング・N+1・キャッシュ設計・SQL 見直し" },
    { star: false, n: "T5", question: "型システム（TypeScript / Java / Go）で恩恵を感じた/困った経験は？", aim: "言語理解", example: "Generics・型推論・ランタイムとのギャップ" },
    { star: true,  n: "T6", question: "既存コードのリファクタリングを主導した経験と、判断基準を教えてください。", aim: "改善力", example: "破壊的変更・段階移行・レビュー巻き込み" },
    { star: false, n: "T7", question: "フロントエンド/バックエンド、どちらの方が得意ですか？その理由も。", aim: "自己理解", example: "得意領域と、その根拠となる経験" },
  ],
  PMO: [
    { star: true,  n: "T1", question: "進捗管理で最も難しかった案件と、そこでの工夫を教えてください。", aim: "PM スキル", example: "遅延要因の可視化・EVM・関係者調整" },
    { star: true,  n: "T3", question: "ステークホルダー間の板挟みになった時、どう対応しますか？", aim: "対人影響力", example: "事実整理・利害調整・妥協点の設計" },
    { star: false, n: "T5", question: "Jira / MS Project / Redmine の使い分けや運用ノウハウは？", aim: "ツール活用", example: "ワークフロー設計・ダッシュボード・自動化" },
    { star: true,  n: "T6", question: "リスク管理で失敗した経験と、そこからの学びを教えてください。", aim: "リスク対応", example: "顕在化・対応遅れ・体制強化" },
    { star: false, n: "T7", question: "経営層向けレポート作成で意識するポイントは？", aim: "経営視点", example: "サマリ・意思決定支援・提案の明確化" },
  ],
  ITSupport: [
    { star: true,  n: "T1", question: "問い合わせ 1 次受付の対応フローを教えてください。", aim: "運用力", example: "受付 → 切り分け → 自己解決 or エスカレ" },
    { star: true,  n: "T3", question: "M365（Exchange/Teams/SharePoint）で経験した障害と対処を教えてください。", aim: "M365 理解", example: "メール遅延・権限問題・テナント設定" },
    { star: false, n: "T5", question: "セキュリティインシデント発生時の初動対応を教えてください。", aim: "セキュリティ", example: "検知 → 隔離 → 影響範囲 → 報告" },
    { star: true,  n: "T6", question: "ITIL のプロセスをどのように現場で活用していますか？", aim: "運用改善", example: "インシデント/問題/変更管理の運用" },
    { star: false, n: "T7", question: "利用者への説明で気を付けていることは？", aim: "対人スキル", example: "技術用語の噛み砕き・共感的な聞き取り" },
  ],
  Special: [
    { star: true,  n: "T1", question: "多岐にわたる領域で、業務の優先順位付けはどうしていますか？", aim: "自己管理", example: "工数見積・影響度・ステークホルダー期待" },
    { star: true,  n: "T3", question: "業務プロセス改善の実績を、Before/After で教えてください。", aim: "改善力", example: "工数削減時間・エラー率減・関係者満足度" },
    { star: false, n: "T5", question: "自動化ツール（Excel VBA / RPA / スクリプト）の得意分野は？", aim: "自動化スキル", example: "作った物の規模・保守性・展開実績" },
    { star: true,  n: "T6", question: "何でも屋として、専門家と協業する上で意識することは？", aim: "協業力", example: "専門家への敬意・自分の役割の明確化" },
    { star: false, n: "T7", question: "業務分析で最初に着手することは？", aim: "分析アプローチ", example: "現状把握・KPI 定義・関係者ヒアリング" },
  ],
};

// ─────────────────── 議事録の回答テンプレ ───────────────────
// 各質問 × プロファイル（high/mid/low）で回答内容を差別化。
// 「【Q番号: 質問短縮】」ヘッダの下に 3〜5 個の bullet で回答内容を書く。
const RESPONSE_TEMPLATES = {
  // ─── 非技術 ───
  Q1: {
    high: [
      "現職は自社 SaaS の ${role_ja}、直近 3 年は ${team_size} 名チームのテックリード",
      "主担当は ${主機能}。売上規模 ${売上} 億円、ユーザ ${users}",
      "前職 SIer で ${前職年数} 年、業務系 Web の要件定義〜運用まで一貫",
      "説明の粒度と時間配分が意識的で、聞き手が構造を把握しやすい",
    ],
    mid: [
      "現職は ${role_ja}、${team_size} 名チームのメンバとして担当",
      "業務は ${主機能}。ざっくり週次で機能追加とバグ改修",
      "前職はほぼ同じ業界で ${前職年数} 年、担当領域を広げてきた",
    ],
    low: [
      "現職は ${role_ja}、業務内容は担当領域が中心",
      "前職も似た仕事、担当変わった経緯はうまく整理できず",
    ],
  },
  Q2: {
    high: [
      "業務外で週 ${learn_h} 時間、${主学習} を継続。書籍と公式ドキュメントを併用",
      "直近は個人 GitHub で ${個人プロジェクト} を実装、実務で使う技術の理解を深めた",
      "月 1 回の社内勉強会で登壇、フィードバックを次の学習計画に反映",
    ],
    mid: [
      "業務外で週 ${learn_h} 時間ほど ${主学習} を触っている",
      "公式チュートリアルを一通り通した程度、実務適用はこれから",
    ],
    low: [
      "業務内で必要になったら学ぶスタイル、業務外の継続学習は限定的",
    ],
  },
  Q3: {
    high: [
      "【状況】${改善_状況}",
      "【行動】${改善_行動}。関係者を巻き込んで週次で進捗を可視化",
      "【結果】${改善_結果}。定量的な成果を上長・チームに共有",
      "反省点として、初期の関係者巻き込みが遅れて 1 週間ロスした点を挙げていた",
    ],
    mid: [
      "小規模な改善提案の経験あり、${改善_行動} を実施",
      "結果はチーム内でポジティブな反応、定量成果までは追えていない",
    ],
    low: [
      "業務指示の範囲内で改善はしているが、自発的な提案までは踏み出せていない",
    ],
  },
  Q4: {
    high: [
      "レビューで技術選定が割れた際、双方の主張を事実ベースで整理し直した",
      "共通の評価軸（保守性・学習コスト・パフォーマンス）を提案し、点数化で合意形成",
      "議論の場で感情的にならず、決定後は反対意見だった側の懸念点をフォローに回った",
    ],
    mid: [
      "対立時は相手の話をまず聞く、その上で自分の意見を伝える",
      "決定に納得できなくても、決まったら従うようにしている",
    ],
    low: [
      "対立を避ける傾向あり、無理に主張はしない",
    ],
  },
  Q5: {
    high: [
      "${失敗_内容}。原因は事前のスコープ合意の甘さと本人分析",
      "以降は要件定義フェーズで「決めない事項」を明示的に列挙するフォーマットを整備",
      "失敗を隠さず 1on1 で共有、後輩の同種失敗を予防できた",
    ],
    mid: [
      "リリース時にレビュー漏れがあり、ホットフィックスで対応した経験",
      "以降はチェックリストを PR テンプレに組み込んで再発防止",
    ],
    low: [
      "失敗と言われて思い出せず、しばらく考えて小さい事例を挙げた",
    ],
  },
  Q6: {
    high: [
      "ストレス時は「切り分け」を意識、業務課題と感情を分ける",
      "運動（週 2 回のジム）と読書で切り替え、月 1 回上司と 1on1 で棚卸し",
    ],
    mid: [
      "帰宅後の趣味時間で切り替え、週末に完全オフを作る",
    ],
    low: [
      "溜め込みがちだが最終的にはこなす、対処法は特に持っていない",
    ],
  },
  Q7: {
    high: [
      "貴社の ${志望_魅力} に強く惹かれ、自身の ${強み} を活かせると感じた",
      "5 年後は ${キャリア目標} を目指しており、貴社のポジションと合致",
      "面談前に公開情報・技術ブログを読み込み、具体的な質問も準備していた",
    ],
    mid: [
      "貴社の事業内容に興味があり、自身のスキルが活かせると考えた",
      "キャリアの幅を広げたい",
    ],
    low: [
      "現職からの転職理由が中心の説明、貴社への志望動機は薄い",
    ],
  },
};

// 技術質問の回答テンプレ (T1-T8)。roleによらず共通の「プロファイル別品質」を提供。
const TECH_RESPONSE_TEMPLATES = {
  T1: {
    high: [
      "${T1_具体} を具体例に、構成図と主要コンポーネント間の依存関係を口頭でも図解でき、採用技術の意図まで踏み込んで説明",
      "所要時間の見立てが正確（説明開始から 55 秒で結論に到達）",
    ],
    mid: [
      "${T1_具体} について、構成要素の列挙は的確、依存関係の説明はやや粗い",
    ],
    low: [
      "全体構成の説明が抽象的で、具体的な構成要素・依存の言及が薄い",
    ],
  },
  T2: {
    high: [
      "${T2_具体}。トレードオフを 3 観点で整理して提示、実案件での判断根拠まで説明",
    ],
    mid: [
      "${T2_具体}。基本的なポイントは押さえているが、深掘り質問への回答は経験値の差が出た",
    ],
    low: [
      "教科書レベルの回答、実案件での経験に基づく発言が少ない",
    ],
  },
  T3: {
    high: [
      "${T3_具体}。定量的な数値（改善 ${T3_before} → ${T3_after}）と、そこに至る分析プロセスを再現性高く説明",
      "解決だけでなく、再発防止として仕組み化・共有まで踏み込んでいる",
    ],
    mid: [
      "${T3_具体}。解決したことは説明できるが、原因分析の深さはやや浅い",
    ],
    low: [
      "類似の経験はあるが、詳細を思い出せず具体化できなかった",
    ],
  },
  T4: {
    high: [
      "${T4_具体}。トレードオフを説明した上で、判断の意思決定プロセスを共有",
    ],
    mid: [
      "${T4_具体}。一般論としての回答、実案件での経験に基づく判断は限定的",
    ],
    low: [
      "回答が抽象的、判断基準を具体化できなかった",
    ],
  },
  T5: {
    high: [
      "${T5_具体}。得意領域だが、限界や落とし穴も自覚的に説明できた",
    ],
    mid: [
      "${T5_具体}。触った経験はあるが、深掘り質問には知識の粗さが露呈",
    ],
    low: [
      "経験が薄く、事前調べレベルの説明にとどまる",
    ],
  },
  T6: {
    high: [
      "${T6_具体}。両方の経験差から、状況に応じた使い分けの視点を提示",
    ],
    mid: [
      "${T6_具体}。片方の経験が中心、もう片方は基礎知識のみ",
    ],
    low: [
      "回答内容が浅く、具体エピソードで裏付けできなかった",
    ],
  },
  T7: {
    high: [
      "${T7_具体}。過去の失敗事例から、必ず徹底しているルールを 3 点提示",
    ],
    mid: [
      "${T7_具体}。標準的な運用は理解しているが、独自の工夫までは至っていない",
    ],
    low: [
      "運用経験が浅く、教科書的な回答にとどまる",
    ],
  },
  T8: {
    high: [
      "${T8_具体}。工夫の目的（可読性・保守性・チーム習熟）まで説明できた",
    ],
    mid: [
      "${T8_具体}。基本的な事例は挙げられたが、影響範囲の説明はやや弱い",
    ],
    low: [
      "自動化・改善への意識は低め、経験も薄い",
    ],
  },
};

// role 別 T1〜T8 の具体内容（回答の中で使う placeholder 値）
const TECH_SPECIFICS_BY_ROLE = {
  NW: {
    T1: "国内 5 拠点 + AWS Direct Connect のハイブリッド構成で OSPF エリア分割",
    T2: "L2 ドメイン分割時のスパニングツリー設計と、トランクポート帯域設計",
    T3: "拠点間 VPN の断続的障害で、パケットキャプチャから MTU 問題を特定",
    T4: "L3 スイッチと FW の役割分担で、負荷と可用性のトレードオフを整理",
    T5: "AWS VPC の Transit Gateway 経由の拠点接続設計、コスト最適化の観点",
    T6: "Cisco は CLI 統一で自動化しやすい、YAMAHA は GUI 操作性で運用者が扱いやすい",
    T7: "手順書の切り戻し条件・立会体制・ロールバック期限（3 分ルール）",
    T8: "Datadog / CloudWatch でのアラート閾値調整、ノイズを 60% 削減した事例",
  },
  Server: {
    T1: "本番 EC2 の LA 上昇で、top → strace → 特定プロセスのメモリリーク特定",
    T2: "PostgreSQL の実行計画から複合インデックス追加、月次バッチ 12 分 → 2 分",
    T3: "Terraform module 分割で環境（dev/stg/prod）別 workspace 運用",
    T4: "EKS の Pod OOM で、requests/limits 見直しと HPA 設定調整",
    T5: "SLI/SLO を基点にした閾値設計、SLA 違反時のエスカレフロー",
    T6: "検証環境で 3 日間動作確認 → 段階適用 → 週次サイクルで安定運用",
    T7: "AWS RDS の予期せぬ再起動対応、パラメータ変更適用タイミングの経験",
    T8: "手作業 45 分の日次作業を PowerShell + タスクスケジューラで自動化、年 180 時間削減",
  },
  Dev: {
    T1: "TypeScript + React + Node.js の SPA と BFF 構成、認証は OIDC で分離",
    T2: "可読性・テスタビリティ・N+1 リスクの 3 観点を PR テンプレに明記",
    T3: "N+1 クエリで API 応答時間 3.2s → 0.4s、include 追加とキャッシュ導入",
    T4: "ユニット 70% + E2E 30% を基準に、GitHub Actions で PR ごと実行",
    T5: "TypeScript の Generics variance で困った経験、conditional types で回避",
    T6: "レガシー Class Component を Function + Hooks に段階移行、6 ヶ月かけ完了",
    T7: "得意はバックエンド、フロントは平均以上だが CSS のミクロ調整はやや不得手",
    T8: "リトライは指数バックオフ、ログは trace_id で追跡、ユーザ通知は種別分岐",
  },
  PMO: {
    T1: "40 名 3 ヶ月の炎上案件でクリティカルパス再構築、EVM 週次可視化",
    T2: "起票基準を明文化（誰でも 30 秒判断可）、優先度は影響 × 緊急度",
    T3: "顧客の要件変更で開発と営業が対立、影響工数を可視化して合意点を設計",
    T4: "レビュー密度 / 欠陥検出率 / 受入基準を KPI 化、ダッシュボード週次更新",
    T5: "Jira の workflow 設計で自動遷移とダッシュボードを整備、運用工数を半減",
    T6: "リスク登録簿の顕在化タイミングが 1 週間遅れ、以降週次レビューを厳格化",
    T7: "経営層向けは 1 スライド 1 メッセージ、意思決定を促す構造に統一",
    T8: "要件変更頻度が高い場合はスクラム、体制固定なら WF の使い分け",
  },
  ITSupport: {
    T1: "受付 → 切り分け（自己解決 or L2 エスカレ）→ 対応 → クローズを SLA 内で運用",
    T2: "GPO 変更後のアカウントロックで、複製状況と DC 間差分の切り分けを実施",
    T3: "Exchange Online のメール遅延で、テナントレベルとトランスポートルール確認",
    T4: "Intune + Autopilot で PC キッティングを自動化、年間 80 時間削減",
    T5: "疑わしいメール検出で該当アカウントの隔離、影響範囲調査、部門長報告",
    T6: "インシデント管理を Jira に集約、月次で問題管理へ昇格判定を実施",
    T7: "利用者向けは「起こったこと・原因・対応・再発防止」の 4 段構成で説明",
    T8: "FAQ 起票基準を明文化、月次で利用率上位を分析して改訂",
  },
  Special: {
    T1: "工数見積 × 影響度で 4 象限マトリクス化、週次で見直し",
    T2: "SQL で加工 → Python で分析 → Tableau で可視化のフローを標準化",
    T3: "請求書処理 45 分 → 5 分へ短縮、Excel VBA と RPA の組み合わせ",
    T4: "3 週間で PoC 完了、スコープを 3 機能に絞り込み経営判断材料を提示",
    T5: "Excel VBA の得意度は高、RPA は小〜中規模の業務向けに実装経験",
    T6: "専門家の意見を尊重し、自分は「橋渡し」に徹する意識",
    T7: "現状の業務フローを 30 分ヒアリング + 実観察で把握、KPI は 3 つに絞る",
    T8: "T 字型を意識、深さは分析、幅は業務理解と IT 全般",
  },
};

// ─────────────────── 志望動機・失敗経験・改善事例のバリエーション ───────────────────
const IMPROVE_STATUS_TEMPLATES = [
  "レガシーな運用手順が属人化して障害時に対応が遅れる状況",
  "新規プロジェクト立ち上げでスケジュール遅延が常態化していた",
  "顧客対応時間が長引きチーム全体の稼働が逼迫していた",
  "コードレビューの観点がレビュアー個人依存でばらつきが大きかった",
];
const IMPROVE_ACTION_TEMPLATES = [
  "業務手順書を Confluence にまとめ、月次で更新するオーナー制度を導入",
  "スコープ管理のフォーマットを整備し、変更影響を定量表示する運用を提案",
  "FAQ を Notion に集約し、1 次受付を自己解決に誘導する仕組みを構築",
  "レビュー観点ドキュメントを社内標準化、PR テンプレートに組み込み",
];
const IMPROVE_RESULT_TEMPLATES = [
  "月次のインシデント時間を 40% 削減、新規参画者の立ち上がりが 2 週間短縮",
  "スケジュール遅延の発生を 3 割減、変更管理の合意形成時間が 半減",
  "問い合わせ 1 次解決率が 55% → 78% に改善、L2 エスカレ工数を月 20 時間削減",
  "PR の再修正回数が平均 2.4 → 1.1 回、レビュー往復時間を 40% 削減",
];
const FAIL_TEMPLATES = [
  "大型案件で要件定義のスコープ合意が甘く、開発途中で追加要件が続出して炎上",
  "リリース直前のレビュー漏れで、本番でパフォーマンス問題が顕在化",
  "後輩の理解度を過大評価し、独り立ちの時期を早めた結果 1 ヶ月ロスした",
  "顧客への進捗報告で楽観的すぎたため、後で信頼を落とし調整が長引いた",
];
const MOTIVATION_TEMPLATES = [
  { 志望_魅力: "自社プロダクトの技術選定の自由度", 強み: "フルスタック開発と設計力", キャリア目標: "テックリードとして意思決定の質を高めること" },
  { 志望_魅力: "顧客との距離の近さと、実装への裁量", 強み: "要件整理と実装のバランス感", キャリア目標: "自社サービスの成長にフルコミットすること" },
  { 志望_魅力: "エンジニアが業務改善に主体的に関わる文化", 強み: "業務理解と改善提案", キャリア目標: "業務ドメイン × 技術の橋渡し役" },
  { 志望_魅力: "少人数チームでの一貫した責任範囲", 強み: "自走力と学習速度", キャリア目標: "3 年後にプロダクトの技術方針を主導する立場" },
];

// ─────────────────── 評価根拠テンプレ ───────────────────
// minutes の【Q..】【T..】ブロックを引用する形の根拠
const AXIS_RATIONALE_TEMPLATES = {
  主体性: {
    high: [
      "【Q2】で業務外の週 ${learn_h} 時間学習と個人プロジェクトの継続、【Q3】で自発的な改善事例（${改善_結果}）が具体的に語られており、自ら課題を設定し行動する姿勢が一貫。反省点まで言及できる。",
      "【Q3】改善提案から関係者巻き込み・定量成果までの主体的推進が確認でき、【T3】でも自ら分析プロセスを設計している。学習・改善・内省が繋がっている。",
    ],
    mid: [
      "【Q2】業務外学習は継続あり、【Q3】小規模改善提案の経験も語られたが、定量成果の把握や巻き込み範囲は限定的。ミドルライン。",
      "指示された範囲での改善は行える一方、自発的な広い改善提案までは踏み出せていない印象。",
    ],
    low: [
      "【Q2】業務外の継続学習が限定的、【Q3】自発的な改善提案の具体事例が薄く、受け身の姿勢が目立つ。",
    ],
  },
  問題解決力: {
    high: [
      "【T1】アーキ説明で構造化力と時間配分が的確、【T3】具体障害の解決で ${T3_before} → ${T3_after} まで数値と分析プロセスを再現性高く説明。原因分析の深さと解決設計の質が高い。",
      "【T3】切り分けが体系的で、【T4】トレードオフ整理も含めた設計判断ができる。定量的な根拠に基づく解決が一貫。",
    ],
    mid: [
      "【T3】解決できた事例は説明できるが、原因分析の深さや代替案提示はやや浅い。定型パターン外ではまだ経験が必要。",
      "既知パターンへの対応は的確、未経験の複合障害では相談を挟むケースが目立つ。",
    ],
    low: [
      "【T3】具体的な障害対応事例を思い出せず、切り分け手順の体系化ができていない印象。",
    ],
  },
  対人影響力: {
    high: [
      "【Q3】改善提案で関係者を巻き込んで成果に繋げた実績、【Q4】対立時に共通評価軸を提案して合意形成した具体例が語られており、影響力の実務裏付けが十分。",
      "【Q4】感情ではなく事実で議論を整理でき、決定後のフォローまで踏み込んでいる。上位者との報連相も適切と推察。",
    ],
    mid: [
      "【Q4】対立時の対応は無難だが、複数ステークホルダを巻き込む場面での経験は限定的。合格ラインに達するが上振れは要確認。",
      "同僚とのコミュニケーションは良好、顧客・他部署との折衝はまだ経験を積む余地あり。",
    ],
    low: [
      "【Q4】対立を避ける傾向あり、【Q7】志望動機の掘り下げも薄く、周囲を動かす影響力の裏付けが少ない。",
    ],
  },
  柔軟性: {
    high: [
      "【Q5】失敗を率直に振り返り再発防止フォーマットへ落とし込んだ経験、【T6】既存アーキの段階移行を主導した経験から、変化への適応力が実務裏付け付き。",
      "【Q5】自己内省が具体的で、【T5】自分の限界も自覚的に説明できる。フィードバック受容と学習の循環が良い。",
    ],
    mid: [
      "【Q5】小さい失敗と学びの共有はできるが、大きな環境変化への適応事例は限定的。",
      "既存の得意領域を選好する傾向、新規領域への挑戦意欲は面談内では見えにくい。",
    ],
    low: [
      "【Q5】失敗事例を具体化できず、内省の深さが物足りない。",
    ],
  },
};

const GOOD_POINT_TEMPLATES = {
  high: [
    "定量的な根拠に基づく説明が一貫（【T3】${T3_before} → ${T3_after} など）。失敗の率直な言語化（【Q5】${失敗_内容}）と自己内省が良好。学習・改善・内省の循環が実務レベルで確認できる。",
    "問題解決力・主体性が実務裏付け付きで高水準（【Q3】改善提案、【T3】具体解決）。学習は計画的で概念レベルまで定着、チーム志向も加点。",
    "技術面と対人面のバランスが取れており、【T1】構造化説明力と【Q4】合意形成の両方で強みを示せている。",
  ],
  mid: [
    "業務内の課題は着実にこなせる、【T1】既存アーキの説明と【Q3】小改善提案の実績あり。チーム内の実務レベルとしては十分機能する。",
    "基礎技術は幅広く押さえており、【Q4】対立時の受容力・【Q6】自己管理も安定。ミドル層としての即戦力性は確認できる。",
  ],
  low: [
    "業務指示に対する着実な対応は可能、【Q6】自己管理と勤怠面の安定性は評価できる。",
  ],
};
const CONCERN_POINT_TEMPLATES = {
  high: [
    "【Q7】志望動機の掘り下げに時間を要した点、【T5】自分の技術限界を過度に控えめに説明した点は要確認。今後のスケール要求（例：${スケール要件}）への適合は継続議論。",
    "顧客折衝（【Q4】)は過去実績十分、直近 2 年のブランクを本人も自覚。Onboarding での再構築が必要。",
  ],
  mid: [
    "定型外の問題解決（【T3】未経験パターン）と、複数ステークホルダを巻き込む影響力（【Q4】）は今後の伸びしろ。",
    "技術深度は中〜中上、より高度なアーキテクチャ判断（【T4】）は経験蓄積で伸ばす余地あり。",
  ],
  low: [
    "自発的な改善提案（【Q3】）と、具体解決事例（【T3】）の裏付けが物足りない。受け身の姿勢が改善課題。",
    "業務外の継続学習（【Q2】）が限定的、成長曲線の見立てが読みにくい。",
  ],
};

const SCALE_REQUIREMENTS = [
  "50→200 名規模のチーム拡大局面での技術リード",
  "月間トラフィック 10 倍化に耐える基盤設計",
  "複数拠点・複数ベンダー間の統括的な運用",
  "経営層への技術投資判断の説明責任",
];

// ─────────────────── ユーティリティ ───────────────────
function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}
function writeJson(p, data) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2), "utf-8");
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function iso(d) {
  return d.toISOString();
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randScore(min, max) {
  const steps = Math.round((max - min) / 0.5);
  return Math.round((min + Math.floor(Math.random() * (steps + 1)) * 0.5) * 10) / 10;
}
function pastDate(monthsBack) {
  const now = Date.now();
  const ms = Math.floor(Math.random() * monthsBack * 30 * 24 * 3600 * 1000);
  return new Date(now - ms);
}
function generateSessionId(氏名, 役割, when) {
  const date = `${when.getFullYear()}${pad(when.getMonth() + 1)}${pad(when.getDate())}`;
  const time = `${pad(when.getHours())}${pad(when.getMinutes())}${pad(when.getSeconds())}`;
  return `${date}_${time}_${氏名}_${役割}`;
}
function subst(str, vars) {
  return str.replace(/\$\{([^}]+)\}/g, (_, k) => (k in vars ? vars[k] : `\${${k}}`));
}
function pickResponses(templatesByProfile, profile, vars) {
  const arr = templatesByProfile[profile] ?? templatesByProfile.mid ?? [];
  return arr.map((t) => "  - " + subst(t, vars));
}

// ─────────────────── 生成本体 ───────────────────
console.log(`📋 生成する件数: ${COUNT}`);

const roleFiles = fs.readdirSync(ROLES_DIR).filter((f) => f.endsWith(".json"));
const ROLES = roleFiles
  .map((f) => readJson(path.join(ROLES_DIR, f)))
  .filter((r) => r.id !== "TEST");
if (ROLES.length === 0) {
  console.error("❌ 有効な役割がありません。");
  process.exit(1);
}
const EVAL_BASE = readJson(EVAL_PATH);
const existing = new Set(
  fs.existsSync(SESSIONS) ? fs.readdirSync(SESSIONS) : [],
);

function roleJa(id) {
  return { NW: "ネットワークエンジニア", Server: "サーバ／インフラエンジニア", Dev: "開発エンジニア", PMO: "PMO", ITSupport: "IT サポート", Special: "業務コンサル・何でも屋" }[id] ?? id;
}

function buildCandidate(role, career, yrs) {
  const skillMap = {
    NW: "Cisco IOS / Catalyst / FortiGate / Palo Alto / Wireshark / packet capture",
    Server: "Linux (RHEL/CentOS/Ubuntu) / Nginx / PostgreSQL / AWS (EKS/RDS/SQS) / Terraform / Ansible / Docker",
    Dev: "TypeScript / React / Node.js / PostgreSQL / Go / GitHub Actions / Docker",
    PMO: "Jira / Confluence / MS Project / EVM / PowerBI / Google Workspace",
    ITSupport: "Active Directory / Microsoft 365 / Intune / Windows Server / ITIL v3",
    Special: "Python / SQL / Excel VBA / Tableau / PowerBI / UiPath",
  };
  const cert = {
    NW: `CCNP R&S (${randInt(2020, 2024)} 年取得)、TOEIC ${randInt(650, 850)}`,
    Server: `AWS SAA (${randInt(2020, 2024)} 年取得)、LPIC Level 2、TOEIC ${randInt(600, 820)}`,
    Dev: `基本情報技術者 (${randInt(2018, 2022)} 年取得)、TOEIC ${randInt(650, 850)}`,
    PMO: `PMP (${randInt(2019, 2023)} 年取得)、TOEIC ${randInt(700, 900)}`,
    ITSupport: `ITIL v3 Foundation、TOEIC ${randInt(600, 800)}`,
    Special: `基本情報技術者、Tableau Desktop Specialist、TOEIC ${randInt(700, 850)}`,
  };
  const concern = {
    NW: `夜間・休日作業は月 ${randInt(2, 4)} 回まで（事前シフト前提）。クラウド NW は AWS 中心で Azure は基礎知識レベル。`,
    Server: `オンコール頻度は月 ${randInt(1, 3)} 回まで、直近 2 年は開発系業務の比重が増え純粋な運用のブランクあり。`,
    Dev: `顧客折衝は経験あるが直近 2 年はブランクあり、本人も自覚。夜間・休日対応は基本不可（家庭事情）。`,
    PMO: `純粋な技術判断（アーキ選定等）は経験薄、意思決定は開発チームに委ねる前提。`,
    ITSupport: `プログラミング経験は VBS/PowerShell まで、開発系業務への広がりは限定的。`,
    Special: `深い専門領域（例：機械学習・低レイヤ実装）は経験なし、幅の広さと深さのバランスは要確認。`,
  };
  return {
    mode: "paste",
    要約:
      `経歴サマリ\n\n${career}\n\n` +
      `保有スキル\n\n技術：${skillMap[role.id]}\n資格：${cert[role.id]}\n\n` +
      `強み\n\n学習速度：業務外で週 ${randInt(5, 12)} 時間の自主学習を継続。近年は ${role.id === "NW" ? "クラウド NW" : role.id === "Server" ? "IaC と SRE 領域" : role.id === "Dev" ? "TypeScript/React 深掘り" : role.id === "PMO" ? "スクラム/OKR 運用" : role.id === "ITSupport" ? "Intune / M365 管理" : "データ分析と業務自動化"}を重点的にキャッチアップ。\n` +
      `説明・伝達力：社内勉強会 ${randInt(3, 8)} 回登壇、ドキュメント整備の社内標準化実績あり。\n` +
      `育成経験：後輩 ${randInt(1, 4)} 名の OJT 指導、モジュール設計・実装のリード経験あり。\n\n` +
      `懸念（事実ベース）\n\n${concern[role.id]}`,
    updatedAt: iso(new Date()),
  };
}

function buildQuestionsRaw(roleId) {
  const tech = TECH_QUESTIONS_BY_ROLE[roleId] ?? TECH_QUESTIONS_BY_ROLE.Dev;
  const lines = ["## 非技術\n"];
  for (const q of NONTECH_QUESTIONS) {
    lines.push(`${q.star ? "⭐ " : ""}${q.n}. ${q.question}`);
    lines.push(`  狙い: ${q.aim}`);
    lines.push(`  解答例: ${q.example}\n`);
  }
  lines.push("## 技術\n");
  for (const q of tech) {
    lines.push(`${q.star ? "⭐ " : ""}${q.n}. ${q.question}`);
    lines.push(`  狙い: ${q.aim}`);
    lines.push(`  解答例: ${q.example}\n`);
  }
  return {
    rawText: lines.join("\n"),
    items: [...NONTECH_QUESTIONS, ...tech].map((q) => ({
      star: q.star,
      question: q.question,
      aim: q.aim,
      example: q.example,
    })),
  };
}

function buildMinutes(role, 氏名, 作成日時, profile) {
  const dateStr = 作成日時.toISOString().slice(0, 10);
  const 開始 = "14:00";
  const 終了 = profile === "high" ? "14:20" : profile === "mid" ? "14:15" : "14:12";

  const tech = TECH_QUESTIONS_BY_ROLE[role.id] ?? TECH_QUESTIONS_BY_ROLE.Dev;
  const specifics = TECH_SPECIFICS_BY_ROLE[role.id] ?? TECH_SPECIFICS_BY_ROLE.Dev;
  const motivation = pick(MOTIVATION_TEMPLATES);

  // 回答テンプレの placeholder 値を用意
  const vars = {
    role_ja: roleJa(role.id),
    team_size: randInt(3, 8),
    主機能: role.id === "NW" ? "拠点間ネットワーク設計" : role.id === "Server" ? "本番運用と SRE" : role.id === "Dev" ? "SaaS 機能開発と設計" : role.id === "PMO" ? "進捗管理と課題調整" : role.id === "ITSupport" ? "社内 IT 運用と障害初動" : "業務改善と PoC 推進",
    売上: randInt(50, 500),
    users: `${randInt(1, 30)} 万`,
    前職年数: randInt(3, 8),
    learn_h: randInt(5, 12),
    主学習: role.id === "NW" ? "AWS ソリューションアーキ" : role.id === "Server" ? "Kubernetes と eBPF" : role.id === "Dev" ? "TypeScript 型システムと Rust 基礎" : role.id === "PMO" ? "OKR と組織開発" : role.id === "ITSupport" ? "Intune と Zero Trust" : "SQL と統計学",
    個人プロジェクト: role.id === "NW" ? "自宅ラボで OSPF/BGP 演習環境" : role.id === "Server" ? "個人 K8s クラスタでの GitOps" : role.id === "Dev" ? "GitHub 上の OSS 貢献" : role.id === "PMO" ? "個人ブログでのマネジメント記事執筆" : role.id === "ITSupport" ? "自宅 AD 環境での GPO 検証" : "Kaggle でのデータ分析コンペ",
    改善_状況: pick(IMPROVE_STATUS_TEMPLATES),
    改善_行動: pick(IMPROVE_ACTION_TEMPLATES),
    改善_結果: pick(IMPROVE_RESULT_TEMPLATES),
    失敗_内容: pick(FAIL_TEMPLATES),
    ...motivation,
    T1_具体: specifics.T1,
    T2_具体: specifics.T2,
    T3_具体: specifics.T3,
    T3_before: randInt(8, 20),
    T3_after: randInt(1, 3),
    T4_具体: specifics.T4,
    T5_具体: specifics.T5,
    T6_具体: specifics.T6,
    T7_具体: specifics.T7,
    T8_具体: specifics.T8,
    スケール要件: pick(SCALE_REQUIREMENTS),
  };

  const blocks = [];
  blocks.push(`日時: ${dateStr} ${開始}-${終了}`);
  blocks.push(`出席: 採用担当（${pick(["田中", "佐藤", "鈴木"])}）、${氏名}`);
  blocks.push(`場所: オンライン（Microsoft Teams）\n`);

  // 非技術 7 問
  for (const q of NONTECH_QUESTIONS) {
    const tpl = RESPONSE_TEMPLATES[q.n];
    if (!tpl) continue;
    const short = q.question.split("？")[0].split("。")[0].slice(0, 20);
    blocks.push(`【${q.n}: ${short}】`);
    blocks.push(pickResponses(tpl, profile, vars).join("\n"));
    blocks.push("");
  }

  // 技術 8 問
  for (const q of tech) {
    const tpl = TECH_RESPONSE_TEMPLATES[q.n];
    if (!tpl) continue;
    const short = q.question.split("？")[0].split("。")[0].slice(0, 20);
    blocks.push(`【${q.n}: ${short}】`);
    blocks.push(pickResponses(tpl, profile, vars).join("\n"));
    blocks.push("");
  }

  // 締め
  blocks.push("【所感（面接官）】");
  const impression = {
    high: "全体的に構造化された回答で、具体エピソード＋数値＋内省の 3 点セットが揃っている。合格ラインを上回る印象。",
    mid: "実務経験は十分、コミュニケーションも安定。深掘り質問への回答の粗さは経験値の差か。ミドル層として推薦可。",
    low: "回答が抽象的な場面が多く、具体エピソードの引き出しに時間を要した。今回のポジションには要確認事項が多い。",
  }[profile];
  blocks.push("  - " + impression);

  return { text: blocks.join("\n"), vars };
}

function buildEvaluation(profile, vars, evalBase) {
  const ranges = {
    high: [3.8, 4.8],
    mid:  [3.3, 4.2],
    low:  [2.0, 3.4],
  };
  const [lo, hi] = ranges[profile];

  const 軸評価 = evalBase.評価軸.map((ax) => {
    const 名前 = ax.名前;
    const rationales = AXIS_RATIONALE_TEMPLATES[名前]?.[profile] ?? [];
    return {
      軸: 名前,
      スコア: randScore(lo, hi),
      根拠: subst(pick(rationales) ?? "根拠テンプレ未定義。", vars),
    };
  });

  const 総合スコア =
    Math.round((軸評価.reduce((s, a) => s + a.スコア, 0) / 軸評価.length) * 10) / 10;

  let 合否;
  if (総合スコア >= evalBase.合格ライン) 合否 = "合格";
  else if (総合スコア >= evalBase.普通ライン) 合否 = "普通";
  else 合否 = "不合格";

  const 自己解決レベル = { high: randInt(4, 5), mid: randInt(3, 4), low: randInt(1, 3) }[profile];

  return {
    mode: "paste",
    軸評価,
    自己解決レベル,
    総合スコア,
    合否,
    良い点: subst(pick(GOOD_POINT_TEMPLATES[profile]), vars),
    懸念点: subst(pick(CONCERN_POINT_TEMPLATES[profile]), vars),
    updatedAt: iso(new Date()),
  };
}

function generateOne(i) {
  const role = pick(ROLES);
  const surname = pick(SURNAMES);
  const isMale = Math.random() < 0.7;
  const given = pick(isMale ? GIVEN_M : GIVEN_F);
  const 氏名 = `${surname} ${given}`;

  const 作成日時 = pastDate(5);
  let id = generateSessionId(氏名, role.id, 作成日時);
  let offset = 0;
  while (existing.has(id)) {
    offset += 1;
    作成日時.setSeconds(作成日時.getSeconds() + 1);
    id = generateSessionId(氏名, role.id, 作成日時);
    if (offset > 100) throw new Error("ID collision loop");
  }
  existing.add(id);

  // status 分布: 評価済 65% / 面談済 15% / 質問公開 10% / 編集中 10%
  const r = Math.random();
  const status =
    r < 0.65 ? "評価済" : r < 0.80 ? "面談済" : r < 0.90 ? "質問公開" : "編集中";

  // profile 分布 (評価済 のみ意味あり): high 30% / mid 50% / low 20%
  const p = Math.random();
  const profile = p < 0.3 ? "high" : p < 0.8 ? "mid" : "low";

  const dir = path.join(SESSIONS, id);
  fs.mkdirSync(path.join(dir, "uploads"), { recursive: true });

  const meta = {
    id,
    氏名,
    役割: role.id,
    作成日時: iso(作成日時),
    status,
    closedAt: null,
    result: "未確定",
    hold: false,
  };

  // ─── ② 候補者情報 ───
  const careerTpl = pick(CAREER_BY_ROLE[role.id] ?? CAREER_BY_ROLE.Dev);
  const yrs = randInt(careerTpl.yrs[0], careerTpl.yrs[1]);
  const career = subst(careerTpl.text, { y: yrs });

  if (status !== "編集中" || Math.random() < 0.5) {
    const candidate = buildCandidate(role, career, yrs);
    candidate.updatedAt = iso(new Date(作成日時.getTime() + 60_000));
    writeJson(path.join(dir, "candidate.json"), candidate);
  }

  // ─── ④ 凍結条件 ───
  if (status !== "編集中") {
    writeJson(path.join(dir, "conditions_snapshot.json"), {
      role,
      eval: EVAL_BASE,
      frozenAt: iso(new Date(作成日時.getTime() + 5 * 60_000)),
    });
  }

  // ─── ⑤ 質問 ───
  if (status !== "編集中") {
    const q = buildQuestionsRaw(role.id);
    writeJson(path.join(dir, "questions.json"), {
      mode: "paste",
      rawText: q.rawText,
      items: q.items,
      updatedAt: iso(new Date(作成日時.getTime() + 10 * 60_000)),
    });
  }

  // ─── ⑥ 議事録 ───
  let minutesVars = null;
  if (status === "面談済" || status === "評価済") {
    const m = buildMinutes(role, 氏名, 作成日時, profile);
    writeJson(path.join(dir, "minutes.json"), {
      text: m.text,
      updatedAt: iso(new Date(作成日時.getTime() + 90 * 60_000)),
    });
    minutesVars = m.vars;
  }

  // ─── ⑧ 評価 ───
  if (status === "評価済" && minutesVars) {
    const evalObj = buildEvaluation(profile, minutesVars, EVAL_BASE);
    const evalUpdated = new Date(作成日時.getTime() + 120 * 60_000);
    evalObj.updatedAt = iso(evalUpdated);
    writeJson(path.join(dir, "evaluation.json"), evalObj);

    meta.closedAt = iso(evalUpdated);
    meta.総合スコア = evalObj.総合スコア;
    meta.合否 = evalObj.合否;

    // result 分布
    if (evalObj.合否 === "合格") {
      const x = Math.random();
      meta.result = x < 0.65 ? "採用" : x < 0.85 ? "未確定" : "不採用";
    } else if (evalObj.合否 === "普通") {
      const x = Math.random();
      meta.result = x < 0.25 ? "採用" : x < 0.6 ? "未確定" : "不採用";
    } else {
      meta.result = Math.random() < 0.9 ? "不採用" : "未確定";
    }
  }

  writeJson(path.join(dir, "session.json"), meta);

  const scoreLabel = meta.合否
    ? `${meta.合否}${meta.総合スコア?.toFixed(1) ?? ""}`.padEnd(8)
    : " ".repeat(8);
  console.log(
    `  [${String(i + 1).padStart(2)}/${COUNT}] ${status.padEnd(4)} ${scoreLabel} ${profile.padEnd(4)}  ${id}`,
  );
}

for (let i = 0; i < COUNT; i++) {
  generateOne(i);
}

console.log(`\n✅ 完了: ${COUNT} 件を data/sessions/ に生成`);
