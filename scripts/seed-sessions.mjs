/**
 * data/sessions/ にリアルな面談レコードを N 件生成する。
 * 使い方: node scripts/seed-sessions.mjs [件数=30]
 *
 * 生成物（各セッションフォルダ配下）:
 *   session.json                 SessionMeta
 *   candidate.json               ① 面談者情報（要約）
 *   conditions_snapshot.json     ② 求める人材条件（凍結）
 *   questions.json               ③ 質問リスト（rawText + items）
 *   minutes.json                 ④ 面談内容
 *   evaluation.json              ⑤ 評価結果
 *
 * ステータス分布（設計書 §9 の遷移を再現）:
 *   編集中   10%  candidate.json のみ
 *   質問公開 10%  + conditions_snapshot + questions
 *   面談済   20%  + minutes
 *   評価済   60%  + evaluation, closedAt 設定, 合否/総合スコア を meta にキャッシュ
 *
 * 「真実の操作」に近づけるための仕掛け:
 *   - 各候補者は persona (性別/年齢/スキル層/性格) を先に決めて、要約〜面談〜評価まで一貫
 *   - 面談内容は Q&A の対話形式、回答文体は persona の性格で変化
 *   - 評価の根拠は面談内容の一部を引用する形で生成
 *   - paste / api モードをランダム混在
 *   - 作成日時 は過去 120 日、closedAt は作成から 3〜21 日後にランダム
 *   - 5% は hold=true、評価済の 15% は result=未確定（迷い案件）
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");
const SESSIONS_DIR = path.join(DATA, "sessions");
const ROLES_DIR = path.join(DATA, "master", "roles");
const EVAL_PATH = path.join(DATA, "master", "eval_criteria.json");

const argCount = Number.parseInt(process.argv[2] ?? "30", 10);
const COUNT = Number.isFinite(argCount) && argCount > 0 ? argCount : 30;

/* ────────────────────────  util  ──────────────────────── */
const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const chance = (p) => Math.random() < p;
const pickN = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));

function pad(n) { return String(n).padStart(2, "0"); }
function fmtStamp(d) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
function iso(d) { return d.toISOString(); }
function addDays(d, days) { return new Date(d.getTime() + days * 86400_000); }

/**
 * 生成タイムスタンプが「未来」に飛ばないよう常に現在時刻 - 1 時間より前にクランプする。
 * 未来の frozenAt / minutes.updatedAt があると Section⑤ が「この評価結果は最新ではありません」
 * を誤検知する（ユーザが API 再評価すると evaluation.updatedAt = 今、seed の frozenAt = 未来 で警告発火）。
 */
const SEED_NOW = new Date();
const SAFE_PAST = new Date(SEED_NOW.getTime() - 3600_000); // 1h 前
function capPast(d) {
  return d.getTime() > SAFE_PAST.getTime() ? SAFE_PAST : d;
}
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), "utf-8");
}

/** 重み付き乱択: [[value, weight], ...] */
function pickWeighted(pairs) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) {
    r -= w;
    if (r <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

/** 0〜5 スケール、0.5 刻みに丸める */
function roundHalf(x) { return Math.round(x * 2) / 2; }
function clampScore(x) { return Math.max(0, Math.min(5, roundHalf(x))); }

/** 加重平均（storage.saveEvaluation と同じロジック） */
function weightedAvg(items) {
  const wsum = items.reduce((s, x) => s + x.w, 0);
  if (wsum <= 0) return 0;
  const sum = items.reduce((s, x) => s + x.v * x.w, 0);
  return Math.round((sum / wsum) * 100) / 100;
}

/* ────────────────────────  master 読み込み  ──────────────────────── */
if (!fs.existsSync(ROLES_DIR)) {
  console.error(`❌ ${ROLES_DIR} が見つかりません。/master で役割を作成してください。`);
  process.exit(1);
}
if (!fs.existsSync(EVAL_PATH)) {
  console.error(`❌ ${EVAL_PATH} が見つかりません。/master で評価条件を保存してください。`);
  process.exit(1);
}

const EVAL_CRITERIA = JSON.parse(fs.readFileSync(EVAL_PATH, "utf-8"));
const ALL_ROLES = fs.readdirSync(ROLES_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(ROLES_DIR, f), "utf-8")));

// config/settings.json の questionCounts に合わせる。無ければ既定 7+8。
// 実 UI では `/settings` の問数設定が prompt と maxTokens の両方を駆動するため、
// 生成する fake データもこれに追従させる（例: 10+10=20問 の運用想定に合わせる）。
const SETTINGS_PATH = path.join(ROOT, "config", "settings.json");
let QUESTION_COUNTS = { nontech: 7, tech: 8 };
if (fs.existsSync(SETTINGS_PATH)) {
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    if (s?.questionCounts?.nontech && s?.questionCounts?.tech) {
      QUESTION_COUNTS = { nontech: s.questionCounts.nontech, tech: s.questionCounts.tech };
    }
  } catch { /* settings が壊れていれば既定を使う */ }
}

if (ALL_ROLES.length === 0) {
  console.error(`❌ 役割が 0 件です。/master で追加してください。`);
  process.exit(1);
}

const NONTECH_AXES = EVAL_CRITERIA["人間性"]?.小軸 ?? [];
const TECH_AXES = EVAL_CRITERIA["技術力"]?.小軸 ?? [];
if (NONTECH_AXES.length === 0 || TECH_AXES.length === 0) {
  console.error("❌ eval_criteria.json の 人間性/技術力 小軸が空です。");
  process.exit(1);
}
const PASS_LINE = EVAL_CRITERIA["合格ライン"] ?? 4;
const NORMAL_LINE = EVAL_CRITERIA["普通ライン"] ?? 3.5;

console.log(`📁 役割: ${ALL_ROLES.map((r) => r.id).join(", ")}`);
console.log(`⚖️ 評価軸: 人間性=[${NONTECH_AXES.map((a) => a.名前).join("/")}] 技術力=[${TECH_AXES.map((a) => a.名前).join("/")}]`);
console.log(`❓ 問数設定: 人間性 ${QUESTION_COUNTS.nontech}問 + 技術 ${QUESTION_COUNTS.tech}問 = 計 ${QUESTION_COUNTS.nontech + QUESTION_COUNTS.tech}問`);
console.log(`🎯 生成件数: ${COUNT}`);

/* ────────────────────────  氏名プール  ──────────────────────── */
const SURNAMES = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "清水", "斎藤",
  "森", "池田", "橋本", "石川", "前田", "藤田", "岡田", "後藤", "長谷川", "石井",
  "村上", "近藤", "坂本", "遠藤", "青木", "藤井", "西村", "福田", "太田", "三浦",
  "岡本", "松田", "中川", "中野", "原田", "小川", "竹内", "金子", "和田", "中島",
];
const GIVEN_M = [
  "翔太", "大輔", "健一", "雄大", "拓海", "涼", "陸", "悠斗", "颯", "蓮",
  "亮介", "恭平", "隼人", "慎也", "智久", "貴志", "洋平", "裕介", "雅也", "龍太",
  "宏樹", "誠", "健太", "拓也", "航", "翼", "駿", "俊介", "和也", "祐一",
];
const GIVEN_F = [
  "美咲", "彩香", "結衣", "真由", "優花", "舞", "菜々子", "愛", "陽菜", "杏奈",
  "麻衣", "千夏", "彩乃", "佳奈", "理沙", "智子", "恵理", "美穂", "綾", "桃子",
  "沙織", "香織", "望", "咲", "由紀", "真紀", "亜衣", "有紀", "礼子", "麻央",
];

/* ────────────────────────  Persona 定義  ────────────────────────
 * 一貫性のあるコンテンツを生むための人物モデル。
 * skill (実力層) → 面談内容の答えの深さ、評価スコアの分布に効く
 * personality (性格) → 回答の文体、面談中の反応
 * background (背景) → 履歴書冒頭のフレーバー
 * ──────────────────────────────────────────────── */
/**
 * 役割 ID を「テンプレート lookup 用の基底キー」に正規化する。
 * NW_LOCK のような編集不可 variant は、ベースの NW と同じ内容プールから引く。
 */
function baseRoleKey(roleId) {
  if (roleId === "NW_LOCK") return "NW";
  return roleId;
}

function makePersona(roleId, roleLabel) {
  const gender = chance(0.7) ? "M" : "F";
  const surname = rand(SURNAMES);
  const given = gender === "M" ? rand(GIVEN_M) : rand(GIVEN_F);
  const name = `${surname}${given}`;

  // 実力層: high 30% / mid 50% / low 20%
  const skill = pickWeighted([["high", 3], ["mid", 5], ["low", 2]]);

  // 経験年数: skill と相関
  const yrs = skill === "high" ? randInt(7, 12)
    : skill === "mid" ? randInt(4, 7)
      : randInt(1, 4);
  const age = Math.min(50, 22 + yrs + randInt(-1, 3));

  // 性格 5 種類
  const personality = pickWeighted([
    ["積極的", 3], ["慎重", 3], ["職人肌", 2], ["のんびり", 1], ["戦略的", 2],
  ]);

  // 背景フレーバー（20% 業界転向 / 15% ブランク明け / 15% 独学 / 10% 副業経験 / 40% 王道）
  const background = pickWeighted([
    ["王道", 4],
    ["業界転向", 2],
    ["ブランク明け", 1.5],
    ["独学出身", 1.5],
    ["副業経験", 1],
  ]);

  return {
    name, gender, age, yrs, skill, personality, background,
    roleId,                            // マスタ ID（NW_LOCK 等の variant を含む）
    roleKey: baseRoleKey(roleId),      // テンプレ lookup 用の正規化キー
    roleLabel: roleLabel ?? roleId,    // 表示用の日本語ラベル
  };
}

/* ────────────────────────  ① 候補者要約（persona 駆動）  ──────────────────────── */

/** 役割別の経歴フレーズプール（skill 層別） */
const CAREER_TEMPLATES = {
  NW: {
    high: [
      "SIer で ${y} 年、通信キャリア/金融の大規模 WAN 更改案件を PM 兼リード SE として複数リード。CCIE R&S 保持。BGP フルルート受信拠点の設計・切替経験多数。",
      "MSP で ${y} 年、Palo Alto Panorama 集中管理環境（200 拠点超）を含む複数顧客の運用設計から夜間切替まで一貫。設計標準テンプレを整備し新人育成を主導。",
      "外資 SIer で ${y} 年、多国籍企業向け SD-WAN 導入 PoC を 5 案件リード。VeloCloud / Silver Peak の実装比較レポートは社内標準として横展開された。",
    ],
    mid: [
      "SIer で ${y} 年、Cisco Catalyst / Nexus と YAMAHA RTX の詳細設計・構築を担当。CCNP R&S 保持、金融機関の拠点更改を年 3〜5 件経験。",
      "通信キャリアで ${y} 年、法人 WAN の設計〜切替を担当。BGP 経路制御、FortiGate クラスタ導入、CCIE 学習中。",
      "MSP で ${y} 年、L2/L3 スイッチ・FW（Palo Alto/FortiGate）の構築運用を年 30 件以上。パケットキャプチャによる障害切り分けが得意。",
    ],
    low: [
      "受託開発から ${y} 年目でネットワークに転向。Catalyst の Config 作成と現地作業員としての支援業務が中心。CCNA 保持、CCNP は学習中。",
      "運用オペレータで ${y} 年、Zabbix でのアラート監視と一次対応を担当。設計や構築の実務経験はまだ限定的。",
      "SES で ${y} 年、常駐先の運用保守（1 次切り分け）に従事。BGP や OSPF は座学レベル。",
    ],
  },
  Server: {
    high: [
      "SaaS スタートアップで ${y} 年、AWS 上の EKS / RDS Aurora / SQS で構成するマルチテナント基盤を SRE リードとして運用。SLO 設計〜Postmortem 文化醸成を主導。",
      "自社サービスで ${y} 年、オンプレ → AWS への 移行 PJ をリード。Datadog + Terraform で監視・IaC を標準化、平均 MTTR を 1/3 に短縮。",
      "外資 SIer で ${y} 年、金融向け Azure 移行案件を複数リード。Kubernetes 上の Postgres 運用、災対 DR 設計まで担当。",
    ],
    mid: [
      "SIer で ${y} 年、オンプレ RHEL7/8 + Oracle 19c の構築から Azure 移行 PoC まで担当。Ansible で構築自動化。夜間パッチ経験。",
      "自社開発で ${y} 年、Nginx + PostgreSQL + Docker Compose の中規模サービスをワンオペ運用。Prometheus / Grafana 整備。",
      "受託開発で ${y} 年、AWS EC2 + RDS の Web インフラを担当。Terraform で IaC 化、CloudWatch アラーム設計を経験。",
    ],
    low: [
      "運用監視で ${y} 年、Zabbix のアラート受付・エスカレーション業務。Linux コマンドは基本のみ。IaC は触れたことがない。",
      "ヘルプデスクから ${y} 年目でサーバ運用へ異動。RHEL7 の基本操作と Windows Server の GUI 運用は経験あり。",
      "SES で ${y} 年、常駐先での Windows パッチ適用・バックアップ確認が主業務。クラウドは学習中。",
    ],
  },
  Dev: {
    high: [
      "自社 SaaS で ${y} 年、TypeScript + React + Node.js のフルスタック開発。テックリードとして 5 名のコード規約整備・PR レビュー基準策定を主導。",
      "スタートアップで ${y} 年、初期メンバとして 0→1 プロダクトを 3 本立ち上げ。Next.js + tRPC + PostgreSQL のアーキ設計から採用まで担当。",
      "外資 Web 系で ${y} 年、Kubernetes 上のマイクロサービス（Go + gRPC）を運用。Feature Flag / A/B テスト基盤整備の実績あり。",
    ],
    mid: [
      "SIer で ${y} 年、Java + Spring Boot の業務系 Web を要件定義から実装まで担当。近年は Kubernetes 移行 PoC に参画。",
      "受託開発で ${y} 年、Ruby on Rails + Vue.js の Web サービスを 5 件立ち上げ。GitHub Actions での CI/CD 整備、Playwright での E2E 導入。",
      "自社サービスで ${y} 年、C# / .NET の業務系開発。近年は React 化 PJ に技術リードとして参画。",
    ],
    low: [
      "SES で ${y} 年、業務系システムの改修担当（Java 8 / Struts 1）。設計は上位者、実装は指示ベース。",
      "受託開発で ${y} 年、PHP + jQuery の EC サイト保守。モダンフレームワークの実務経験はまだ。",
      "独学 + プログラミングスクール卒。個人開発の Next.js アプリを 1 本ポートフォリオに、実務は ${y} 年目。",
    ],
  },
  PMO: {
    high: [
      "コンサルで ${y} 年、SIer 大規模案件（50〜100 名）の全社横断 PMO を複数リード。EVM 標準化、経営層向け週次レポート運用を確立。",
      "自社サービスで ${y} 年、開発チームのスクラムマスター兼 PMO。Jira / Confluence の運用標準化とベロシティ改善実績（+40%）。",
      "外資 PMO で ${y} 年、多国籍 PJ の進捗管理を英語で対応。PMP + 各種 PM 資格保持。",
    ],
    mid: [
      "コンサルで ${y} 年、SIer 案件の進捗管理・EVM・課題管理を担当。10〜30 名規模の PMO を 4 案件経験。PMP 保持。",
      "SIer で ${y} 年、部門 PMO として全社標準テンプレの整備・展開を担当。ステアリングコミッティ運営も経験。",
      "受託 SIer で ${y} 年、案件 PMO として WBS 起票・課題管理を担当。Redmine / Backlog に精通。",
    ],
    low: [
      "事務職から ${y} 年目で PMO に異動。ExcelWBS 更新やドキュメント整理が主業務、EVM 等は座学レベル。",
      "SIer 新卒 ${y} 年目、PJ アシスタントとして議事録・課題台帳の更新を担当。上位者の指示で動く段階。",
      "業務改善コンサル 1 社目 ${y} 年目、初期メンバとしてクライアントプロジェクトを 2 件経験。",
    ],
  },
  ITSupport: {
    high: [
      "社内 IT で ${y} 年、社員 2000 名規模の PC キッティング・AD 運用・Microsoft 365 サポートを 3 名チームで統括。Intune 移行 PoC をリード。",
      "MSP で ${y} 年、複数顧客の運用監視と障害初動対応。ITIL Foundation + Practitioner 保持、障害エスカレーション手順の標準化を主導。",
      "外資 SI ヘルプデスクで ${y} 年、英語 1 次受付を担当。多国籍社員 500 名分の VPN / Wi-Fi / Zoom トラブル対応が日常業務。",
    ],
    mid: [
      "社内 IT で ${y} 年、社員 500 名規模の Windows 端末運用・AD 管理・Microsoft 365 サポート。ITIL v3 Foundation 保持。",
      "ヘルプデスクで ${y} 年、社員 800 名規模の 1 次受付と障害切り分け。SLA 管理、FAQ ナレッジ整備、月次レポート担当。",
      "MSP で ${y} 年、複数顧客の運用監視。夜間シフト実績多数、Zabbix アラート運用の標準化に携わる。",
    ],
    low: [
      "販売職から ${y} 年目でヘルプデスクに転向。基本的な PC 設定・Office トラブル対応を経験。",
      "コールセンター経験 ${y} 年、社内 IT ヘルプデスク 1 年目。VDI 環境の初歩を学習中。",
      "SES で ${y} 年、常駐先の 1 次受付（電話・Teams）が主業務。ADの実操作はまだ経験浅い。",
    ],
  },
};

const BACKGROUND_PHRASES = {
  業界転向: [
    "前職は ${prev}。技術志向が強く、より深い専門性を求めて IT 業界へ転職。",
    "${prev} 業界で ${prevY} 年勤務後、独学で技術を身に付けて転向。前職経験を活かした顧客視点の設計提案が武器。",
  ],
  ブランク明け: [
    "育児で 2 年のブランクあり。復帰後の学習意欲は高く、直近半年で基礎資格を 2 つ取得。",
    "留学のため 1.5 年のブランクあり。復帰後は最新スタックのキャッチアップを積極的に進めている。",
  ],
  独学出身: [
    "非情報系学部出身。オンライン学習と個人開発で基礎を固めた独学派。実務経験は ${y} 年。",
    "文系新卒でスクールを経て転向。独学志向が強く、業務外での学習時間は週 10 時間以上を継続。",
  ],
  副業経験: [
    "本業と並行して副業で個人案件を 3 件受託。マルチプロジェクト経験が強み。",
    "本業のほか、コミュニティ発の OSS に継続コミット。技術発信ブログの月間 PV は 5000 前後。",
  ],
  王道: [""],
};

const PREV_INDUSTRY = ["製造業（品質管理）", "金融機関（システム部門）", "小売（IT 担当）", "医療事務", "商社（バックオフィス）"];

/**
 * 候補者要約を SUMMARY_OUTPUT_SCHEMA に沿って生成:
 *   - 経歴: 職種・年数・主要案件を 3〜5 項目
 *   - 主要スキル: 技術・資格・ツールを 3〜5 項目
 *   - 強み: 具体例つきで 2〜3 点
 *   - 懸念点: 事実ベースで（推測なら「要確認」と明記）
 *
 * 実運用の Claude が SUMMARY_TEXT_INSTRUCTION に従って返す JSON をイメージした密度。
 */
function candidateSummary(persona, role) {
  const templates = CAREER_TEMPLATES[persona.roleKey] ?? CAREER_TEMPLATES.Dev;
  const careerTemplate = rand(templates[persona.skill]);
  const mainCareer = careerTemplate.replace("${y}", String(persona.yrs));

  // 経歴は 3〜5 項目: (現職本流) + (前職 or ブランク) + (直近の主要案件) + (成果 or 資格)
  const bgFlavor = rand(BACKGROUND_PHRASES[persona.background])
    .replace("${prev}", rand(PREV_INDUSTRY))
    .replace("${prevY}", String(randInt(3, 8)))
    .replace("${y}", String(persona.yrs));

  const 経歴 = careerBullets(persona, mainCareer, bgFlavor);
  const 主要スキル = skillsFor(persona);
  const 強み = strengthsFor(persona, role);
  const 懸念点 = concernsFor(persona, role);

  const text = [
    `# 経歴\n${経歴}`,
    `# 主要スキル\n${主要スキル}`,
    `# 強み\n${強み}`,
    `# 懸念点\n${懸念点}`,
  ].join("\n\n");

  return { text, 経歴, 主要スキル, 強み, 懸念点 };
}

/**
 * 経歴を 3〜5 項目の箇条書きに展開。
 * 実際の JD/履歴書に近い解像度で、期間・案件規模・数値を混ぜる。
 */
function careerBullets(persona, mainCareer, bgFlavor) {
  const roleKey = persona.roleKey;

  const bullets = [];
  bullets.push(`【現職】${mainCareer}`);

  if (bgFlavor) bullets.push(`【背景】${bgFlavor}`);

  // 直近の主要案件（役割別プール）
  const projects = {
    NW: [
      `直近案件: 金融機関 A 社の全社 WAN 更改（拠点 ${randInt(20, 60)} 個, 期間 ${randInt(6, 12)} ヶ月）を詳細設計〜切替まで担当。夜間切替は 4 回、無停止で完了。`,
      `直近案件: 製造業 B 社の SD-WAN 導入 PoC。既存 MPLS 併存で ${randInt(5, 15)} 拠点段階切替、CIO 直下の技術検討会に技術支援として参画。`,
      `直近案件: 通信事業者 C 社向けのマルチクラウド接続設計。AWS Direct Connect + Azure ExpressRoute の冗長構成、月間 ${randInt(50, 200)} Gbps トラフィック規模。`,
    ],
    Server: [
      `直近案件: SaaS スタートアップの EKS 移行 PJ（旧 EC2 → EKS, ${randInt(30, 150)} マイクロサービス）を SRE リードとして担当。移行後の SLO は 99.95% を継続達成。`,
      `直近案件: 金融向け Azure 移行案件で、既存オンプレ ${randInt(40, 120)} サーバの段階移行を計画〜実装。RTO 4 時間 / RPO 15 分を実測で満たすリストア設計。`,
      `直近案件: ECサイトの Datadog + Terraform 標準化。監視項目 ${randInt(200, 500)} 個、SLI 定義 15 個、平均 MTTR を 40 分 → 12 分に短縮。`,
    ],
    Dev: [
      `直近案件: 自社 SaaS の新規プロダクト立ち上げ。Next.js + tRPC + PostgreSQL、チーム ${randInt(3, 8)} 名、リリース後 3 ヶ月で MAU ${randInt(5, 30)} 万到達。`,
      `直近案件: レガシー Java (Struts 1) → Spring Boot 3 モダナイズ PJ。${randInt(50, 200)} 画面規模のリライトを 6 ヶ月で完遂、リグレッション率 ${randInt(1, 3)}% 以下維持。`,
      `直近案件: 決済基盤のマイクロサービス化。gRPC + Kubernetes、日次トランザクション ${randInt(10, 100)} 万件、可用性 99.99% 実測達成。`,
    ],
    PMO: [
      `直近案件: SIer 大規模案件（総額 ${randInt(3, 15)} 億円 / 参画 ${randInt(30, 80)} 名）の全社横断 PMO を 18 ヶ月担当。CPI/SPI 逸脱の兆候検知と経営層への即時報告を仕組み化。`,
      `直近案件: 自社サービスのスクラム導入 PJ。3 チーム / ${randInt(15, 25)} 名の運営を SM 兼 PMO として担当、平均ベロシティを ${randInt(30, 60)}% 改善。`,
      `直近案件: 官公庁向け SI 案件の課題管理刷新（Redmine → Jira 移行、起票基準の標準化）。起票品質向上でレビュー滞留を 40% 削減。`,
    ],
    ITSupport: [
      `直近案件: 社員 ${randInt(500, 3000)} 名規模の Windows 11 展開 + Intune / Autopilot 導入 PoC。GPO ${randInt(80, 200)} 本の棚卸と Config Profiles 写像を担当。`,
      `直近案件: 全社的な MFA 導入案件。ヘルプデスク 1 次受付として月 ${randInt(200, 500)} 件の問い合わせを対応、FAQ 継続整備で解決率 ${randInt(75, 90)}% を維持。`,
      `直近案件: MSP 顧客 ${randInt(5, 15)} 社の運用監視。夜間シフトを含む 3 交代 24/7 体制、Zabbix 監視の閾値見直しでアラート数 ${randInt(30, 60)}% 削減。`,
    ],
  };
  bullets.push(rand(projects[roleKey] ?? projects.Dev));

  // 成果/資格の一節
  const achievements = {
    high: [
      `社内表彰: 直近 2 年で「技術貢献賞」を ${randInt(1, 2)} 回受賞。`,
      `保有資格: ${qualsFor(roleKey, "high")}。`,
      `対外発信: 技術ブログ月間 ${randInt(3, 8)} 本、社内勉強会は月 1 回主催。`,
    ],
    mid: [
      `保有資格: ${qualsFor(roleKey, "mid")}。継続的な資格更新を意識。`,
      `社内活動: 若手向け勉強会（月 1 回）を運営、後輩 ${randInt(2, 5)} 名の OJT 担当実績。`,
    ],
    low: [
      `保有資格: ${qualsFor(roleKey, "low")}。上位資格を継続学習中。`,
      `直近 1 年の学習: 業務外で週 ${randInt(3, 8)} 時間程度、指定書籍 + 個人ハンズオンで基礎固め。`,
    ],
  };
  bullets.push(rand(achievements[persona.skill]));

  return bullets.map((b) => `- ${b}`).join("\n");
}

/** 役割 × skill に紐づく代表資格をランダムに 1〜2 個 */
function qualsFor(roleKey, skill) {
  const map = {
    NW: {
      high: ["CCIE R&S", "CCNP + AWS SAP", "JNCIE-SP"],
      mid: ["CCNP R&S", "CCNP + AWS SAA", "AWS SAA + ネットワークスペシャリスト"],
      low: ["CCNA", "CCNA 学習中 + Linux LPIC-1"],
    },
    Server: {
      high: ["AWS SAP + CKA", "Azure Solutions Architect Expert + Terraform Associate", "AWS DevOps Pro"],
      mid: ["AWS SAA + LPIC-2", "Azure Administrator + Ansible 認定", "AWS SysOps + PostgreSQL 12 Silver"],
      low: ["AWS CLF + LPIC-1", "Azure Fundamentals + Linux 基礎"],
    },
    Dev: {
      high: ["OSS メンテナ + AWS SAP", "Google Cloud Professional Developer + 応用情報", "情報処理安全確保支援士 + AWS SAA"],
      mid: ["応用情報 + AWS SAA", "基本情報 + Java Silver + AWS CLF", "情報処理安全確保支援士 学習中"],
      low: ["基本情報 + Java Bronze"],
    },
    PMO: {
      high: ["PMP + PMI-ACP", "PMP + Prince2 Practitioner", "PMP + LeSS Basic"],
      mid: ["PMP", "PMP 学習中 + PJM 基礎", "PJM-BOK 認定"],
      low: ["PJM 入門書修了", "PJM 学習中"],
    },
    ITSupport: {
      high: ["ITIL Practitioner + Microsoft 365 Expert", "ITIL Foundation + Microsoft 365 Administrator + LPIC-1"],
      mid: ["ITIL Foundation + Microsoft 365 Fundamentals", "MCP + ITIL Foundation"],
      low: ["ITIL Foundation 学習中"],
    },
  };
  const pool = map[roleKey]?.[skill] ?? map.Dev.mid;
  return rand(pool);
}

const SKILL_POOLS = {
  NW: {
    high: ["Cisco Catalyst / Nexus 詳細設計", "Palo Alto Panorama", "BGP フルルート運用", "SD-WAN (VeloCloud)", "CCIE R&S / CCNP", "Wireshark でのパケット解析"],
    mid: ["Cisco Catalyst 設計", "FortiGate クラスタ", "YAMAHA RTX 系", "OSPF / BGP 基本", "CCNP R&S 保持", "パケット解析（tcpdump）"],
    low: ["Catalyst Config 作成補助", "現地作業支援", "Zabbix 監視画面確認", "CCNA 保持"],
  },
  Server: {
    high: ["AWS EKS / RDS Aurora 運用", "Terraform / Ansible", "Datadog / Prometheus", "SLO / エラーバジェット設計", "PostgreSQL パフォーマンスチューニング", "Kubernetes オペレータ開発"],
    mid: ["RHEL 7/8 運用", "AWS EC2 / RDS", "Ansible 構築自動化", "Zabbix / Prometheus", "Docker Compose"],
    low: ["Zabbix 監視オペ", "Linux 基本コマンド", "Windows Server GUI 運用"],
  },
  Dev: {
    high: ["TypeScript / React / Next.js", "Node.js マイクロサービス", "GraphQL / gRPC", "PostgreSQL / Redis", "Kubernetes / Argo CD", "設計レビュー / メンタリング"],
    mid: ["Java / Spring Boot", "React / Vue.js", "MySQL / PostgreSQL", "GitHub Actions CI/CD", "Playwright E2E"],
    low: ["Java 8 / Struts 1（保守案件）", "jQuery / Bootstrap", "個人開発 Next.js アプリ"],
  },
  PMO: {
    high: ["EVM / WBS 標準化", "Jira / Confluence 高度運用", "経営層向けレポーティング", "スクラム / SAFe 導入", "PMP + PMI-ACP"],
    mid: ["進捗管理（EVM）", "課題管理 / リスク管理", "Redmine / Backlog", "PMP 保持"],
    low: ["Excel WBS 更新", "議事録作成", "課題台帳整理"],
  },
  ITSupport: {
    high: ["Microsoft 365 管理", "Intune / Autopilot", "AD / Entra ID", "ITIL Practitioner", "英語 1 次対応"],
    mid: ["Windows 端末キッティング", "AD 運用", "Microsoft 365 サポート", "ITIL Foundation"],
    low: ["PC 設定基本", "Office トラブル対応"],
  },
};

function skillsFor(p) {
  const pool = SKILL_POOLS[p.roleKey] ?? SKILL_POOLS.Dev;
  const list = pool[p.skill] ?? pool.mid;
  // 3〜5 項目（skill が high なら 5、low なら 3）
  const target = p.skill === "high" ? 5 : p.skill === "mid" ? 4 : 3;
  return pickN(list, Math.min(list.length, target)).map((s) => `- ${s}`).join("\n");
}

const STRENGTH_POOLS = {
  積極的: [
    "自ら課題を発見し、周囲を巻き込んで解決に向かうリーダーシップ",
    "新技術キャッチアップの速さ。技術ブログや勉強会への参加が習慣化",
    "PJ 開始直後から関係者ヒアリングを主導する行動力",
  ],
  慎重: [
    "本番影響を最小化する変更手順設計の徹底さ",
    "ドキュメント整備と手順書化に対する強いこだわり",
    "リスク洗い出しの網羅性の高さ、レビュー観点の抜け漏れが少ない",
  ],
  職人肌: [
    "深く 1 技術に潜って理解を積み上げる姿勢",
    "コードや Config の細部までこだわる品質意識",
    "問題の根本原因を突き止めるまで諦めない粘り強さ",
  ],
  のんびり: [
    "衝突を避け、チームの潤滑油として機能する柔らかさ",
    "顧客対応での温かい印象、リピート指名が多い",
    "焦らず腰を据えて長期案件に取り組む安定感",
  ],
  戦略的: [
    "PJ 全体像を早期に俯瞰し、優先順位づけを的確に行う判断力",
    "顧客の背景まで踏み込んで提案を組み立てる構想力",
    "上位者への情報伝達と経営視点でのトレードオフ議論ができる",
  ],
};

function strengthsFor(p) {
  const pool = STRENGTH_POOLS[p.personality] ?? STRENGTH_POOLS.慎重;
  // 2〜3 点、具体例（persona / 役割由来）を付ける
  const chosen = pickN(pool, p.skill === "low" ? 2 : 3);
  return chosen.map((s) => `- ${s}\n  例: ${strengthExample(p)}`).join("\n");
}

/**
 * 強みに添える「具体例」文。役割 + 性格の組み合わせで簡潔な数字入りエピソードを返す。
 */
function strengthExample(p) {
  const roleKey = p.roleKey;
  const examples = {
    NW: [
      `直近案件で夜間切替 ${randInt(3, 8)} 回を無停止で完遂、切戻し発動 0 件。`,
      `構成標準テンプレを整備し、案件立ち上げ工数を平均 ${randInt(20, 40)}% 削減。`,
      `顧客の CIO 直下の技術検討会に単独で参画、決裁を ${randInt(2, 6)} 回引き出した。`,
    ],
    Server: [
      `MTTR を ${randInt(30, 60)} 分 → ${randInt(5, 15)} 分に短縮、SLO を四半期連続で達成。`,
      `Terraform / Ansible 標準化により初期構築工数を ${randInt(30, 50)}% 削減。`,
      `PostgreSQL のスロークエリを ${randInt(5, 12)} 個特定し、平均レイテンシ ${randInt(20, 60)}% 改善。`,
    ],
    Dev: [
      `新機能リリース後 3 ヶ月でユーザ増加率 ${randInt(20, 50)}% に貢献、CV 率も ${randInt(3, 10)}% 改善。`,
      `PR レビュー標準化でリグレッション率 ${randInt(50, 70)}% 削減、平均リリース間隔 2 週間 → 1 週間に。`,
      `型定義の整備で本番エラー ${randInt(30, 60)}% 削減、開発体験 (DX) の改善事例として社内共有。`,
    ],
    PMO: [
      `${randInt(30, 80)} 名規模 PJ の遅延を Weekly 先行指標で察知、計画通りローンチ実現。`,
      `課題管理刷新により起票品質を向上、レビュー滞留数を ${randInt(30, 60)}% 削減。`,
      `経営層 SC で提案した是正策 ${randInt(2, 5)} 件が採択、意思決定所要日数を 1/3 に短縮。`,
    ],
    ITSupport: [
      `Intune 移行 PoC を主導、キッティング作業を 1 台 ${randInt(30, 60)} 分 → ${randInt(5, 15)} 分に短縮。`,
      `FAQ 継続整備で 1 次解決率 ${randInt(20, 40)}% 改善、ヘルプデスクの応答時間短縮に貢献。`,
      `AD 運用の自動化スクリプトを ${randInt(3, 8)} 本作成、月 ${randInt(10, 30)} 時間分の運用工数を削減。`,
    ],
  };
  const pool = examples[roleKey] ?? examples.Dev;
  return rand(pool);
}

/**
 * 懸念点: 事実ベース、推測は「要確認」明示。2〜4 項目でまとめる。
 */
function concernsFor(p) {
  const concerns = [];
  if (p.skill === "low") {
    concerns.push("実務経験 " + p.yrs + " 年で、要件定義〜設計フェーズの単独リード経験は履歴書からは読み取れない。案件アサイン時の伴走体制は要確認。");
  }
  if (p.background === "業界転向") {
    concerns.push("IT 業界でのキャリアが 3 年未満のため、業務ドメイン（金融/公共/EC 等）固有の知識は要確認。");
  }
  if (p.background === "ブランク明け") {
    concerns.push("職務ブランクあり。復帰後のスタック（クラウド / モダンフレームワーク）のキャッチアップ状況は面談で要確認。");
  }
  if (p.background === "独学出身") {
    concerns.push("独学ベースのため、チーム開発のプラクティス（PR レビュー / CI/CD / オンコール等）の経験深度は要確認。");
  }
  if (p.personality === "のんびり") {
    concerns.push("履歴書からは短期案件（3 ヶ月以内）のリード経験が読み取れない。速度感が求められる場面での適応は要確認。");
  }
  if (p.personality === "職人肌") {
    concerns.push("深掘り志向が強い分、複数領域を横断する広さがどう保たれているかは要確認。");
  }
  // 転職回数（ランダムに 20% で追加）
  if (chance(0.2)) {
    concerns.push("直近 5 年で転職 " + randInt(2, 4) + " 回。各社での在籍理由と離職理由の一貫性は要確認。");
  }
  // 年収 / 条件面（15% で追加）
  if (chance(0.15)) {
    concerns.push("希望年収レンジが弊社給与テーブルの上限付近。合意可能な範囲かは 2 次面接で要確認。");
  }
  if (concerns.length === 0) {
    concerns.push("履歴書上の懸念は特になし。ただし面談で①志望動機の具体性 ②入社後 3 ヶ月のスコープ認識 は要確認。");
  }
  return concerns.map((s) => `- ${s}`).join("\n");
}

/* ────────────────────────  ③ 質問リスト  ──────────────────────── */

// 人間性: 12 問プール（`/settings` の nontech 問数から先頭 N 問を採用）
const NONTECH_QUESTIONS = [
  { star: true, key: "Q1", q: "自己紹介と直近の役割を 1〜2 分でお願いします。", aim: "コミュニケーション力 / 論理性", ex: "現職の役割・チーム規模・具体的な成果を簡潔に構造化して説明" },
  { star: false, key: "Q2", q: "現職で最も自ら提案して改善した事例を、状況・行動・結果の順で教えてください。", aim: "主体性 / 影響力", ex: "業務改善・後輩指導など、自発的な行動と定量的な成果" },
  { star: true, key: "Q3", q: "うまくいかなかった経験と、そこから学んだことを教えてください。", aim: "内省 / 学習意欲", ex: "失敗を率直に振り返り、次回の行動変容につなげた事例" },
  { star: false, key: "Q4", q: "直近半年で新しく学習したことは何ですか？書籍・動画・実装のいずれかで具体的に。", aim: "学習意欲", ex: "投資している時間、学び方、業務への還元" },
  { star: false, key: "Q5", q: "ストレスがかかる場面での自分なりの対処法は？", aim: "セルフマネジメント", ex: "業務に支障が出ない範囲での具体的な対処法" },
  { star: true, key: "Q6", q: "なぜ弊社/この職種を志望されるのですか？", aim: "志望動機 / 定着性", ex: "具体的な魅力ポイントと自身のキャリアプランとの結びつき" },
  { star: false, key: "Q7", q: "3 年後・5 年後の姿として描いているものがあれば教えてください。", aim: "キャリア観 / 定着性", ex: "職能・役割の変化に対する主観的な意欲" },
  { star: true, key: "Q8", q: "チームで意見が対立した時、どう合意形成しますか？直近の実例で。", aim: "コミュニケーション力 / 主体性", ex: "自分と相手の立場整理、代替案提示、決定プロセス" },
  { star: false, key: "Q9", q: "後輩やメンバーへ知識を伝える機会はありますか？その際に工夫していることは？", aim: "コミュニケーション力 / 影響力", ex: "説明の順序、相手の理解度確認、フォロー体制" },
  { star: false, key: "Q10", q: "これまでのキャリアで最も影響を受けた人物・イベントと、そこから得たものを教えてください。", aim: "内省 / 学習意欲", ex: "具体的な人物 / 出来事と、行動変容につながった学び" },
  { star: false, key: "Q11", q: "業務外での興味関心や、継続的に取り組んでいることを教えてください。", aim: "セルフマネジメント / 学習意欲", ex: "趣味・OSS・コミュニティ・学習など" },
  { star: false, key: "Q12", q: "働く上で大切にしている価値観、逆に許容できないことはありますか？", aim: "定着性 / カルチャーフィット", ex: "行動基準、譲れないポイント、避けたい環境" },
];

const TECH_QUESTIONS_BY_ROLE = {
  NW: [
    { star: true, key: "T1", q: "OSPF と BGP の使い分け基準を、実案件の例で説明してください。", aim: "専門知識 / 問題解決力", ex: "エリア設計・AS 境界・拠点間ポリシーの観点" },
    { star: false, key: "T2", q: "L2 ループ発生時の切り分け手順を、直近の実例で説明してください。", aim: "問題解決力", ex: "疎通確認 → MAC テーブル → STP → 原因" },
    { star: true, key: "T3", q: "本番 NW 障害の切り分け手順を教えてください。", aim: "問題解決力 / 障害対応", ex: "疎通 → ログ → packet capture → 原因特定 → 恒久対策" },
    { star: false, key: "T4", q: "クラウド NW（AWS VPC / Azure VNet）とオンプレ NW の設計上の違いで意識するのは？", aim: "専門知識 / 設計力", ex: "セキュリティグループ・ルートテーブル・PrivateLink 等" },
    { star: false, key: "T5", q: "夜間切替で必ず徹底していることは？", aim: "設計力 / 運用堅牢性", ex: "手順書・切り戻し条件・立会体制・ロールバック期限" },
    { star: false, key: "T6", q: "Palo Alto と FortiGate 両方の経験があれば、運用上の違いを教えてください。", aim: "専門知識", ex: "GUI 差分、ログ形式、ライセンス体系" },
    { star: false, key: "T7", q: "SD-WAN 導入で最も難しいと感じたポイントは？", aim: "設計力", ex: "回線ポリシー、フォールバック、監視統合" },
    { star: false, key: "T8", q: "顧客に代替案を提示する際、どんな観点で比較しますか？", aim: "設計力 / コミュニケーション", ex: "コスト、拡張性、運用容易性、リスク" },
    { star: true, key: "T9", q: "ゼロトラスト・ネットワークの設計思想を、従来型 (境界防御) と対比して説明してください。", aim: "専門知識 / 設計力", ex: "境界防御からの脱却、ID ベース制御、セグメント設計" },
    { star: false, key: "T10", q: "監視・アラート設計で、ノイズを減らすためにやっている工夫を教えてください。", aim: "設計力 / 運用", ex: "SNMP polling 間隔、しきい値設計、相関イベント抑制" },
    { star: false, key: "T11", q: "機器の EOSL 対応で、切替計画をどう組み立てますか？", aim: "設計力 / 判断力", ex: "リプレース時期の逆算、並行運用期間、顧客合意プロセス" },
    { star: false, key: "T12", q: "現行構成を継承する引継ぎ資料は、どんな粒度で作りますか？", aim: "コミュニケーション力 / 設計力", ex: "構成図、Config、運用手順、既知の癖" },
  ],
  Server: [
    { star: true, key: "T1", q: "Linux サーバ負荷が高い時の切り分け手順を教えてください。", aim: "問題解決力", ex: "top/vmstat/iostat → 特定プロセス → strace/perf → 原因" },
    { star: false, key: "T2", q: "Terraform / Ansible で自動化した経験と、そこでの設計判断は？", aim: "設計力", ex: "モジュール分割・state 管理・変更適用ワークフロー" },
    { star: true, key: "T3", q: "SLO / エラーバジェット設計の考え方を教えてください。", aim: "専門知識 / 設計力", ex: "指標選定、目標値、バジェット消費時のポリシー" },
    { star: false, key: "T4", q: "監視設計で意識するポイントは？失敗談も。", aim: "設計力", ex: "SLI/SLO・閾値・ノイズ削減・オンコール負荷" },
    { star: false, key: "T5", q: "AWS と Azure 両方の経験があれば、設計上の違いを教えてください。", aim: "専門知識", ex: "IAM 設計思想、VPC/VNet モデル、マネージド DB の差" },
    { star: false, key: "T6", q: "本番 DB のパフォーマンス劣化。何から見ますか？", aim: "問題解決力", ex: "スロークエリログ、実行計画、統計情報、locks" },
    { star: false, key: "T7", q: "コンテナ化の是非を判断する基準は？", aim: "設計力", ex: "ステートフル性、CI/CD 成熟度、運用体制" },
    { star: false, key: "T8", q: "オンコール対応の負荷を減らす工夫を教えてください。", aim: "設計力 / 運用", ex: "Runbook 整備、Alert チューニング、Autoheal" },
    { star: true, key: "T9", q: "バックアップとリストアの運用で、必ず確認していることは？", aim: "設計力 / 判断力", ex: "リストア試験の頻度、RTO/RPO の実測、世代管理" },
    { star: false, key: "T10", q: "本番切替のリリース戦略（Blue-Green / Canary / rolling）の使い分けは？", aim: "設計力", ex: "サービス特性、ロールバック容易性、DB スキーマ変更の有無" },
    { star: false, key: "T11", q: "セキュリティ設計で、開発チームに求める最低限の要件は？", aim: "設計力 / コミュニケーション力", ex: "IAM 最小権限、Secret 管理、依存パッチ運用" },
    { star: false, key: "T12", q: "コスト最適化の提案時に、どんな観点で分析しますか？", aim: "判断力 / 設計力", ex: "使用率、Reserved / Savings Plans、ライフサイクル管理" },
  ],
  Dev: [
    { star: true, key: "T1", q: "設計レビューで最も重視している観点は何ですか？", aim: "設計力", ex: "拡張性、テスト容易性、責務分離" },
    { star: false, key: "T2", q: "TypeScript の型システムをどれくらい活用していますか？", aim: "専門知識", ex: "Generics、Conditional Types、Branded Types" },
    { star: true, key: "T3", q: "本番障害の切り分けの経験を、直近の実例で説明してください。", aim: "問題解決力", ex: "ログ → 再現 → 原因特定 → 恒久対策" },
    { star: false, key: "T4", q: "テスト戦略（unit / integration / E2E）の使い分けは？", aim: "設計力", ex: "カバレッジ、実行速度、変更に強い層" },
    { star: false, key: "T5", q: "React で状態管理の選択基準は？", aim: "専門知識 / 設計力", ex: "サーバ状態 vs UI 状態、Zustand/Jotai/Redux の使い分け" },
    { star: false, key: "T6", q: "CI/CD で必ず入れるチェックは？", aim: "設計力", ex: "Lint、型、テスト、E2E、Preview デプロイ" },
    { star: false, key: "T7", q: "レガシー保守案件で、リファクタの優先順位をどうつけますか？", aim: "設計力 / 判断力", ex: "変更頻度、影響範囲、テスト有無" },
    { star: false, key: "T8", q: "後輩レビューで意識していることは？", aim: "コミュニケーション力", ex: "意図の言語化、指摘の粒度、心理的安全性" },
    { star: true, key: "T9", q: "API 設計（REST / GraphQL）の使い分け基準を、根拠付きで教えてください。", aim: "設計力 / 判断力", ex: "クライアント特性、キャッシュ、開発速度" },
    { star: false, key: "T10", q: "パフォーマンス問題（フロント / API）の切り分け手順は？", aim: "問題解決力", ex: "Lighthouse / DevTools / APM / DB ログ" },
    { star: false, key: "T11", q: "セキュリティ観点（XSS/CSRF/認可）で、実装レビュー時に必ず見るのは？", aim: "設計力 / 専門知識", ex: "サニタイズ、CSRF トークン、認可チェックの層" },
    { star: false, key: "T12", q: "新技術の採否を、チームでどう判断していますか？", aim: "判断力 / コミュニケーション力", ex: "PoC、リスク、既存資産との互換、チームスキル" },
  ],
  PMO: [
    { star: true, key: "T1", q: "遅延兆候を早期発見するための工夫は？", aim: "問題解決力", ex: "先行指標、EVM、担当者ヒアリング" },
    { star: false, key: "T2", q: "課題管理の運用ルールで大事にしていることは？", aim: "設計力", ex: "起票基準、ステータス定義、レビュー頻度" },
    { star: true, key: "T3", q: "経営層への報告資料で意識する構成は？", aim: "コミュニケーション / 論理性", ex: "結論先出し、指標の見せ方、アクション明示" },
    { star: false, key: "T4", q: "ステアリングコミッティ運営の経験と、そこでの立ち回りは？", aim: "コミュニケーション", ex: "議題整理、意思決定支援、決定事項の追跡" },
    { star: false, key: "T5", q: "リスクレジスタの実運用はどうしていますか？", aim: "設計力", ex: "識別基準、影響評価、対応計画のトラッキング" },
    { star: false, key: "T6", q: "PMO とスクラムマスターの役割はどう区別しますか？", aim: "専門知識", ex: "領域の重なり、意思決定範囲、ステークホルダー" },
    { star: false, key: "T7", q: "PMO ツールで実運用したことがあるものは？", aim: "専門知識", ex: "Jira、Redmine、MS Project、Backlog" },
    { star: false, key: "T8", q: "PJ ローンチ直後の PMO 業務で最初にやることは？", aim: "設計力", ex: "WBS ベースライン化、体制図確定、報告経路確定" },
    { star: true, key: "T9", q: "遅延しているベンダを立て直すには、どんなアプローチを取りますか？", aim: "コミュニケーション力 / 判断力", ex: "現状把握、原因ヒアリング、対処案の合意、フォロー" },
    { star: false, key: "T10", q: "予算超過の兆候を発見した時、どんな順で対応しますか？", aim: "判断力 / 問題解決力", ex: "原因特定、影響試算、対処案立案、上位者合意" },
    { star: false, key: "T11", q: "PJ 終盤の意思決定を早めるために、意識していることは？", aim: "コミュニケーション力 / 主体性", ex: "会議設計、決裁者早期巻き込み、決定事項の即時通知" },
    { star: false, key: "T12", q: "他社との協業案件で、責任分界と成果配分をどう設計しますか？", aim: "設計力 / 判断力", ex: "契約、KPI、双方の得意領域、リスク配分" },
  ],
  ITSupport: [
    { star: true, key: "T1", q: "Windows 端末が起動しない、というインシデントの切り分け順序は？", aim: "問題解決力", ex: "電源 → BIOS → OS → イベントログ" },
    { star: false, key: "T2", q: "AD ロックアウトの発生源を特定する手順は？", aim: "問題解決力", ex: "イベント ID 4740、Netlogon ログ、ソース PC" },
    { star: true, key: "T3", q: "Intune / Autopilot 移行の PoC で意識するのは？", aim: "設計力", ex: "既存 GPO の写像、キッティング効率、初期セキュリティ設定" },
    { star: false, key: "T4", q: "難しい問い合わせ対応でのユーザとのコミュニケーションで意識することは？", aim: "コミュニケーション力", ex: "傾聴、専門用語の言い換え、期待値管理" },
    { star: false, key: "T5", q: "1 次対応で解決率を上げるために工夫していることは？", aim: "問題解決力", ex: "FAQ 整備、ナレッジ検索の習慣化、切り分けフローの標準化" },
    { star: false, key: "T6", q: "Microsoft 365 のトラブルで最近対応したものは？", aim: "専門知識", ex: "Teams 音声品質、Exchange 委任、SharePoint 権限" },
    { star: false, key: "T7", q: "SLA 遵守のために日次でチェックしていることは？", aim: "設計力", ex: "未解決チケット、担当者負荷、エスカレーション状況" },
    { star: false, key: "T8", q: "上位者への的確なエスカレーションのコツは？", aim: "コミュニケーション力", ex: "事象・影響・切り分け結果を先出し、依頼事項を明確化" },
    { star: true, key: "T9", q: "PC キッティング作業を効率化するために、実施したことは？", aim: "設計力 / 主体性", ex: "MDT / Autopilot / スクリプト自動化" },
    { star: false, key: "T10", q: "セキュリティインシデント（ウイルス検知 / 情報漏洩の疑い）の初動手順は？", aim: "問題解決力 / 判断力", ex: "隔離、影響範囲確認、上位者通知、証跡保全" },
    { star: false, key: "T11", q: "月次で担当している定例レポートに、どんな指標を載せていますか？", aim: "コミュニケーション力 / 設計力", ex: "インシデント件数、SLA 達成率、傾向分析" },
    { star: false, key: "T12", q: "業務中に自分自身のスキルを継続的に伸ばすために、どんな工夫をしていますか？", aim: "学習意欲 / セルフマネジメント", ex: "資格学習、社外コミュニティ、業務外の検証環境" },
  ],
};
// NW_LOCK 等の variant は persona.roleKey (= baseRoleKey で NW に正規化) 経由で lookup するため、
// ここではエイリアス不要。もし将来別の variant を追加する場合は baseRoleKey に条件追加すること。

function buildQuestionsText(roleId) {
  const tech = TECH_QUESTIONS_BY_ROLE[baseRoleKey(roleId)] ?? TECH_QUESTIONS_BY_ROLE.Dev;
  // `/settings` の questionCounts に従って先頭 N 問を採用（プールを超えたら全て使う）
  const nontech = NONTECH_QUESTIONS.slice(0, Math.min(QUESTION_COUNTS.nontech, NONTECH_QUESTIONS.length));
  const techPicks = tech.slice(0, Math.min(QUESTION_COUNTS.tech, tech.length));

  const fmt = (arr) => arr.map((q) => {
    const star = q.star ? "⭐ " : "";
    return `${star}${q.key}. ${q.q}\n  狙い: ${q.aim}\n  解答例: ${q.ex}`;
  }).join("\n\n");

  const rawText = `## 人間性\n${fmt(nontech)}\n\n## 技術\n${fmt(techPicks)}\n`;
  const items = [...nontech, ...techPicks].map((q) => ({
    star: q.star,
    question: q.q,
    aim: q.aim,
    example: q.ex,
  }));
  return { rawText, items, nontech, tech: techPicks };
}

/* ────────────────────────  ④ 面談内容（Q&A 対話形式）  ──────────────────────── */

/**
 * 回答フレーバー: skill × personality で表情を変える。
 * 実際の面談は Q に対して数分の答えがある → 100〜300 字/回答を目安。
 */
function answerFor(persona, q) {
  const depth = persona.skill === "high" ? "深い"
    : persona.skill === "mid" ? "標準的"
      : "浅い";

  // 人間性 Q1〜Q12 は質問ごとに専用ハンドラで返す（テンプレ感を減らすため）
  const nonTechHandlers = {
    Q1: selfIntroAnswer,
    Q2: proactiveAnswer,
    Q3: failureAnswer,
    Q4: learningAnswer,
    Q5: stressAnswer,
    Q6: motivationAnswer,
    Q7: careerPlanAnswer,
    Q8: conflictAnswer,
    Q9: mentoringAnswer,
    Q10: influenceAnswer,
    Q11: hobbyAnswer,
    Q12: valuesAnswer,
  };
  const handler = nonTechHandlers[q.key];
  if (handler) return handler(persona);

  if (q.key.startsWith("T")) return techAnswer(persona, q, depth);
  return genericAnswer(persona, q);
}

function selfIntroAnswer(p) {
  const opener = pickWeighted([
    [`${p.name}と申します。`, 3],
    [`${p.name}です、本日はよろしくお願いします。`, 2],
    [`${p.name}です。本日はお時間いただきありがとうございます。`, 2],
  ]);
  const body = CAREER_TEMPLATES[p.roleKey]?.[p.skill]?.[0]?.replace("${y}", String(p.yrs))
    ?? `${p.roleLabel} で ${p.yrs} 年経験があります。`;
  const closer = p.personality === "積極的" ? "貴社では技術リードとして影響範囲を広げていきたいです。"
    : p.personality === "慎重" ? "貴社の運用フェーズでの品質担保に貢献できればと考えています。"
      : p.personality === "職人肌" ? "1 つの技術を深く掘る姿勢を貴社でも活かしたいです。"
        : p.personality === "戦略的" ? "貴社では PJ 全体を俯瞰しつつ、顧客価値の最大化に貢献したいです。"
          : "貴社では長く安定的に貢献できればと考えています。";
  return `${opener}\n${body}\n${closer}`;
}

function failureAnswer(p) {
  const scenarios = {
    NW: "顧客先の夜間切替で、事前検証を怠って本番の VLAN 番号が bogus だったことに気付かず、切替後に一部拠点が疎通できない状態を起こしました。",
    Server: "本番 DB のインデックス追加を、業務時間の谷間に安易に流して 30 分ロック取得を起こし、業務停止に至らせました。",
    Dev: "リリース前の E2E テストを『時間の都合』でスキップし、本番でモバイル UI のクラッシュを 3 時間発生させました。",
    PMO: "リスク管理台帳の更新頻度を軽視し、遅延兆候を早期発見できず、SC で経営層から強く指摘を受けました。",
    ITSupport: "上位者への一次エスカレーション判断が遅く、影響ユーザが 30 分拡大しました。",
  };
  const scene = scenarios[p.roleKey] ?? scenarios.Dev;
  const learning = p.personality === "慎重" ? "以降は手順書のダブルチェックとロールバック条件の事前明文化を徹底しています。"
    : p.personality === "積極的" ? "翌週にはチーム内で振り返り会を主催し、再発防止策の PR まで自分で出しました。"
      : p.personality === "職人肌" ? "この経験から根本原因の掘り下げに関するナレッジを蓄積し、社内 Wiki に体系化しました。"
        : "以降は自分の判断のみで進めず、必ず上位者に確認を取るようにしています。";
  return `${scene}\n${learning}`;
}

function motivationAnswer(p) {
  const hooks = [
    "貴社の技術ブログを継続的に拝見しており、",
    "選考過程で会話した現場のエンジニアの方々の姿勢に共感し、",
    "貴社の顧客への向き合い方（品質重視）に強く惹かれ、",
    "貴社の事業ドメイン（金融/公共/自社サービス）に関心があり、",
  ];
  const asks = {
    積極的: "自分の技術リーダーシップを試せる環境だと感じました。",
    慎重: "堅い運用文化と自分のスタイルの相性が良いと感じました。",
    職人肌: "1 つの技術を深く追求する余地があると感じました。",
    のんびり: "長期的に腰を据えて働ける環境と感じました。",
    戦略的: "戦略と実装の両方に関われる希少なポジションだと感じました。",
  };
  const targetRole = p.roleKey === "PMO" ? "PJ マネージャ" : "テックリード / SME";
  return `${rand(hooks)}${asks[p.personality]}\nキャリアプランとしては、3〜5 年以内に ${targetRole}として複数案件を自走できる状態を目指しており、貴社での業務がその実現に直結すると考えています。`;
}

function proactiveAnswer(p) {
  const scenes = {
    NW: "既存の運用ドキュメントに構成図が古かった問題に気付き、自主的に最新化を提案。",
    Server: "デプロイ手順が属人化していた問題に気付き、Ansible playbook 化と手順書刷新を提案。",
    Dev: "テストが不足していた領域を発見し、優先順位付きのカバレッジ改善計画を提案。",
    PMO: "課題管理の起票基準が曖昧だった問題を発見し、テンプレとレビュー会を提案。",
    ITSupport: "FAQ が古いまま放置されていた問題に気付き、月次更新の定例化を提案。",
  };
  const scene = scenes[p.roleKey] ?? scenes.Dev;
  const result = p.skill === "high" ? "結果的にチーム全体の作業効率が体感で 3〜4 割改善し、他 PJ にも横展開されました。"
    : p.skill === "mid" ? "結果的に自分のチーム内での工数削減（月 20 時間程度）につながりました。"
      : "小規模ですが自分の作業効率が明確に上がりました。上司からも良い試みと評価いただきました。";
  return `${scene}\n${result}`;
}

/* ─── 人間性 Q4〜Q12 の個別ハンドラ ─── */

function learningAnswer(p) {
  const items = {
    high: [
      `直近では「${rand(["ゼロトラスト・ネットワーク実装ガイド", "System Design Interview vol.2", "詳解 Terraform", "実践 SRE", "Designing Data-Intensive Applications"])}」を読み進めていて、週末に個人プロジェクトで概念を試しています。時間は週 ${randInt(6, 12)} 時間。`,
      `会社のスキル振替制度を使って「${rand(["AWS SAP", "CKAD", "情報処理安全確保支援士"])}」に挑戦中で、朝 1 時間の学習を平日継続しています。`,
      `技術ブログを月 ${randInt(2, 5)} 本発信していて、直近だと「${rand(["OpenTelemetry 導入", "gRPC で作る mini-K8s", "Postgres 16 の新機能検証"])}」がバズって社外からの反響もありました。`,
    ],
    mid: [
      `直近は「${rand(["リーダブルコード（再読）", "詳解 Kubernetes", "実践 Rust", "システム設計面接対策"])}」を読んでいます。業務外の学習時間は週 ${randInt(3, 6)} 時間ほど。`,
      `${rand(["AWS SAA", "LPIC-2", "情報処理"])} の資格更新に向けて、Udemy の問題集と模擬試験を並行しています。`,
      `社内勉強会で ${rand(["Zod によるバリデーション", "Feature Flag 運用", "Datadog 監視設計"])} について 30 分発表し、質疑で理解が深まりました。`,
    ],
    low: [
      `プログラミングスクールの復習と、公式ドキュメントの読み込みを中心にやっています。時間は週 ${randInt(4, 8)} 時間ほど確保しています。`,
      `${rand(["基本情報", "AWS CLF", "LPIC-1"])} の学習を続けていて、模擬試験でようやく 7 割を安定して取れるようになってきました。`,
      `先輩に勧められた「${rand(["リーダブルコード", "プロを目指す人のための Ruby 入門", "Web を支える技術"])}」を読み終えて、まとめノートを Notion に整理しています。`,
    ],
  };
  return `${rand(items[p.skill])}\n業務で活かせる形にするため、学んだ内容は必ず翌週の PR や設計会に反映するようにしています。`;
}

function stressAnswer(p) {
  const styles = {
    積極的: "同僚に相談して気持ちを整理するタイプです。抱え込まずに 24 時間以内に誰かに話すルールを自分に課しています。",
    慎重: "客観視するために、状況・原因・対応可能な範囲・非常時プランを紙に書き出してタスク化するようにしています。",
    職人肌: "運動やリフレッシュより、まず問題そのものを深く分析することでコントロール感を取り戻すタイプです。夜のうちに手を動かしてしまうことも。",
    のんびり: "早めに帰宅して料理や散歩でリセットするようにしています。翌朝の頭がスッキリしている時間に対処するのが自分のスタイル。",
    戦略的: "優先度の再整理から入ります。今抱えているタスクの ${重要度 × 緊急度} でランクを見直し、切り捨てる/延期する判断を上長と即すり合わせします。",
  };
  const routines = [
    "毎朝 30 分の運動（ランニング or ヨガ）で自律神経を整えるのも継続しています。",
    "オンコール週明けは必ず 30 分の振り返り時間を取り、感情ログをつけてパターン化するようにしています。",
    "月 1 回、上司との 1on1 で気になる点を棚卸する仕組みも活用しています。",
  ];
  return `${styles[p.personality] ?? styles.慎重}\n${rand(routines)}`;
}

function careerPlanAnswer(p) {
  const yrs3 = p.roleKey === "PMO" ? "PM としてリーダー案件を単独で完遂できる状態"
    : "テックリード / SME として設計〜運用まで自走できる状態";
  const yrs5 = p.roleKey === "PMO" ? "組織横断の PMO や部門立ち上げに関われる立場"
    : "アーキテクト or マネージャとして複数案件を俯瞰できる立場";
  return `3 年後は ${yrs3}、5 年後は ${yrs5} を目指しています。\nそのために直近では ${rand(["設計レビューの主導回数", "外部発信の頻度", "資格の取得", "後輩育成の実績"])} を意識的に増やしています。\n貴社での業務はキャリアプランと直結しており、特に ${rand(["同業のトップランナーとの協業", "扱う案件規模の大きさ", "エンジニア組織の成熟度"])} に強く惹かれています。`;
}

function conflictAnswer(p) {
  const styles = {
    積極的: "自分の主張は先に明確にした上で、相手の背景を丁寧に聞くようにしています。案件では、Aさんとリリース戦略で対立した際、双方の懸念（品質 vs 速度）を可視化し、Canary 展開で妥協点を作りました。",
    慎重: "まずは事実確認から入り、主観と客観を切り分けて論点を絞ります。決めきれない場合は上長にファシリテーションを依頼する判断も躊躇しません。直近では設計方針で意見が割れた際に、比較表を作って合意まで持っていきました。",
    職人肌: "技術的な合理性を突き詰める中で、時に強めに主張することもありますが、最終的にはデータで議論を落ち着かせるようにしています。DB 設計で意見が割れた際、パフォーマンステスト結果を共有して合意形成しました。",
    のんびり: "対立を長引かせない方針で、早めに 1on1 を設定して背景を聞き出すようにしています。相手の懸念に共感を示した後、代替案を 2 案並べる形で合意を取ることが多いです。",
    戦略的: "利害関係者マップを頭の中で描き、それぞれの Won't-Give-Up を先に把握します。トレードオフを明示した提案を持って行くことで、対立の温度感を下げるようにしています。",
  };
  return `${styles[p.personality] ?? styles.慎重}\n合意形成の場では、決定事項と保留事項を必ず文字化して共有します。後日「言った/言わない」の火種を残さないため。`;
}

function mentoringAnswer(p) {
  const roles = {
    high: `後輩 ${randInt(3, 6)} 名の OJT を担当しています。設計レビューの観点を毎週 1 テーマ絞って解説するミニ勉強会を継続、参加者から「レビュー観点が体系化された」と評価をもらっています。`,
    mid: `OJT で後輩 ${randInt(1, 3)} 名を見ていて、毎日 15 分の 1on1 で困りごとをキャッチする時間を確保しています。技術指導は 1 テーマ完結型で伝えるようにしています。`,
    low: `直近では業務スケジュール上、後輩指導の主担当ではありませんが、PR レビューでコメントを丁寧に書くようにしていて、意図が伝わるよう「なぜ」を必ず添えるようにしています。`,
  };
  const nuance = p.personality === "積極的" ? "自分から質問しやすい雰囲気を作ることも意識しています。"
    : p.personality === "職人肌" ? "技術詳細のトレードオフを一緒に議論する時間を大切にしています。"
      : "教える相手のスキルレベルに合わせて、抽象度を意識的に調整しています。";
  return `${roles[p.skill]}\n${nuance}`;
}

function influenceAnswer(p) {
  const scenarios = [
    `新卒 2 年目の頃の上司です。「設計判断は必ず 3 案考えて比較する」という習慣を教えてもらい、以降キャリアの根幹になっています。`,
    `独立系の SIer 時代のプロジェクトで、緊急障害を明け方 3 時までチームで乗り切った経験です。役割を超えた助け合いの価値観がこの時に自分の中に刻まれました。`,
    `外部の勉強会で登壇者から聞いた「コードは書いた瞬間からレガシー」という言葉に強く共感し、以降ドキュメント整備と自動テストを最優先するようになりました。`,
    `オープンソースコミュニティでの PR レビュー体験です。世界中のメンテナから徹底的にレビューされ、コードの書き方に対する自分の甘さを痛感しました。以降レビュー観点が変わりました。`,
    `育児休暇からの復帰時、時間制約の中で成果を出す必要に迫られた経験。優先度付けとタスクの委任のスキルが飛躍的に向上しました。`,
  ];
  return `${rand(scenarios)}\nこの経験から学んだ「${rand(["構造化", "早期の共有", "ドキュメント First", "根本原因追及", "タイムボックス"])}」の姿勢は、今も自分の仕事の核になっています。`;
}

function hobbyAnswer(p) {
  const activities = {
    積極的: [
      `週末は${rand(["草野球のリーグ", "地域ボードゲーム会", "個人開発の副業案件"])}に参加しています。組織外の人と対話する機会を意識的に作っています。`,
      `${rand(["技術カンファレンスの運営スタッフ", "OSS コミュニティ", "テック系ポッドキャストの視聴"])}をライフワークにしています。`,
    ],
    慎重: [
      `${rand(["読書（月 3〜5 冊）", "英会話（週 2 回のオンライン）", "写経（週末 2 時間）"])}を継続しています。習慣化することを大切にしています。`,
      `${rand(["家庭菜園", "ランニング（週 20km）", "資格試験の学習"])}をルーティン化しています。`,
    ],
    職人肌: [
      `${rand(["自宅サーバでの各種検証", "3D プリンタでの工作", "自作キーボード"])}に凝っています。手を動かすことが自分の学びの中心。`,
      `${rand(["Kaggle コンペ参加", "OSS のバグ修正 PR", "個人ブログでの技術発信"])}を続けていて、深く追求する場になっています。`,
    ],
    のんびり: [
      `${rand(["ドライブ", "家庭菜園", "犬の散歩", "映画館通い"])}が息抜きになっています。無理せず継続できることを選んでいます。`,
      `${rand(["料理", "カフェ巡り", "写真"])}を趣味にしていて、SNS でシェアするのが日常です。`,
    ],
    戦略的: [
      `${rand(["ビジネス書の輪読会", "投資の勉強", "戦略ボードゲーム"])}が最近の関心事です。仕事の外側の思考も鍛える意識でやっています。`,
      `${rand(["起業家インタビューポッドキャスト", "他業界の見学ツアー", "MBA 志望友人との勉強会"])}に定期参加しています。`,
    ],
  };
  return `${rand(activities[p.personality] ?? activities.慎重)}\n${rand(["月 1 回のリセット日は完全にオフラインで過ごす", "オンとオフの切り替えは明確にする", "夜 22 時以降は仕事の Slack を見ないルール"])}にしていて、燃え尽きないよう工夫しています。`;
}

function valuesAnswer(p) {
  const values = {
    積極的: `大切にしているのは「まず動く、動きながら考える」姿勢です。決めきれずに時間だけ消費するのが最も嫌なので、仮説を立てて 1 週間で検証する動き方を選んでいます。`,
    慎重: `「安全性と品質を最優先」の価値観を大事にしています。特に本番影響のある変更は、ロールバック手順を含めた合意なしには進めないのが自分のルールです。`,
    職人肌: `「妥協せず、根本を理解する」ことを大切にしています。表面的な対応で終わらせて後で戻ってくる案件を何度も見てきたので、時間をかけても本質を突き止めるやり方を選びます。`,
    のんびり: `「長く続けられる働き方」を大切にしています。短期の頑張りより、5 年 10 年で結果が出るような習慣化と関係構築を優先しています。`,
    戦略的: `「全体最適の視点」を持ち続けることです。部分最適に陥って手戻りが増えるのを避けるため、常に一歩引いて優先度を見直す時間を意識的に取っています。`,
  };
  const noGo = [
    "許容できないのは、事後報告が続くカルチャーです。合意なしの大きな判断は透明性を損なうので。",
    "許容できないのは、失敗を個人責任に押し付ける文化です。プロセス改善で解ける問題を人格の話にすり替えたくないので。",
    "許容できないのは、過剰なマイクロマネジメントです。任されたスコープの中で自律的に動くのが自分の生産性の源泉なので。",
    "許容できないのは、ドキュメントを一切残さないカルチャーです。属人化は組織の中長期を壊すと思っているので。",
  ];
  return `${values[p.personality] ?? values.慎重}\n${rand(noGo)}`;
}
/* ─── 人間性ハンドラここまで ─── */

const TECH_ANSWER_TEMPLATES = {
  NW: {
    深い: [
      "OSPF はエリア設計で LSDB のサイズを制御できるため中〜大規模の内部ルーティングに向きます。ABR / ASBR の役割分担で階層構造を作れるのが強み。一方 BGP は AS 単位のポリシーを実装するのに向いており、拠点間で異なる ISP を経由する場合や、経路コミュニティで優先度を制御したい場合に選びます。実案件では 30 拠点の内部 OSPF + 対外 iBGP フルメッシュ構成を提案しました。",
      "夜間切替では、①手順書と切り戻し手順の事前レビュー ②立会体制と連絡経路の確定 ③時限判断（例: 30 分以内に疎通が戻らなければロールバック）を必ず徹底しています。加えて事前検証環境でのリハーサル 2 回を通例化しています。",
      "L2 ループの切り分けでは、まず MAC アドレステーブルのフラッピングを show mac-address で確認、次に STP のポート状態を見て BPDU の受信状況をチェックします。ループガード / BPDU ガードの発動履歴も忘れずに見ます。原因の 8 割は外付け HUB か CDP 無効化された機器です。",
      "SD-WAN 導入の難所は既存 WAN との併存期間の設計です。旧回線と新回線を平行運用しつつ、拠点単位で段階的に切り替える計画と、ロールバック閾値の合意が最重要です。VeloCloud の PoC では 5 拠点で 3 ヶ月かけて安定化させました。",
      "Palo Alto と FortiGate は、Palo が App-ID ベースのポリシー設計思想、Forti は UTM 統合と TCO の優位性、と大きく違います。既存の Forti 環境に段階的に Palo を混ぜる導入では、ログ収集の統合（Panorama vs FortiAnalyzer）の設計が最も工数を要しました。",
      "顧客への代替案提示では、必ず ①コスト（初期＋運用 5 年 TCO） ②可用性 ③運用スキル要求 ④拡張性 の 4 軸で比較表を作って提示します。決めるのは顧客なので、判断材料を揃えることが自分の役割と考えています。",
    ],
    標準的: [
      "OSPF は同一 AS 内、BGP は AS 境界で使うという基本原則で選択しています。実務では中規模の拠点間で OSPF、対外 ISP との接続で BGP を選ぶことが多いです。",
      "本番障害では 疎通確認 → ログ確認 → packet capture の順で進めます。切り分けの粒度を段階的に上げていくイメージです。",
      "夜間切替では手順書のレビューと立会体制の確認を必ずやります。切り戻し条件は事前に上位者と合意を取っています。",
      "クラウド NW とオンプレでは、SG / NACL のようなステートフル / ステートレスの違いや、ルートテーブルの単位感（サブネット vs VRF）が大きく違うと感じています。",
      "Palo と Forti の運用では、GUI の階層構造や CLI コマンドの体系がかなり違うので、両方の常用は現実的でないと感じています。片方を主軸にしてもう片方は必要時に調べる、という付き合い方です。",
      "L2 ループ切り分けは STP の状態と MAC テーブルを最初に見るのが基本です。CDP / LLDP で隣接を確認して怪しいポートを絞ります。",
    ],
    浅い: [
      "OSPF と BGP は座学レベルで学びました。実案件で自分で選定した経験はまだありませんが、上位者の判断基準を横で見て学んでいます。",
      "障害切り分けは Runbook に従って行うレベルです。自分で仮説を立てる練習を積んでいる段階です。",
      "夜間切替は現地作業員として同行するレベルで、手順書は先輩が書いたものを使っています。",
      "クラウド NW は AWS の VPC と SG くらいまでで、実務経験は限定的です。個人アカウントで学習しています。",
      "パラアラや Forti の GUI は触ったことがある程度で、ポリシー設計はまだ担当していません。",
    ],
  },
  Server: {
    深い: [
      "SLO はユーザ視点の SLI（可用性・レイテンシ）を選定し、目標値を経営指標と紐付けます。エラーバジェットが尽きたら新機能開発を止めて信頼性改善に振る、というポリシーを開発チームと合意しました。半期で 2 回発動して、実際に改善スプリントを回した経験があります。",
      "Terraform では envs / modules に分割し、共通 IAM や VPC は shared module、サービス固有は app module に置きます。state は S3 + DynamoDB でロック、CI で terraform plan の PR コメントを義務化しています。",
      "本番 DB のパフォーマンス劣化では、まず pg_stat_statements で TOP N のクエリを特定、実行計画を見て統計情報が古くないか確認、その後 locks と blocking セッションを見ます。8 割は統計情報の更新漏れかインデックス不足です。",
      "コンテナ化の判断は、ステートフル性の高さと運用体制の成熟度で決めます。ステートフル DB はコンテナ化しないと決めていて、CI/CD が Blue-Green まで自動化されていないなら k8s は時期尚早と伝えるようにしています。",
      "監視設計の失敗談として、閾値アラートを密に張りすぎて夜間の false positive でオンコールが疲弊した経験があります。SLO ベースのアラートに切り替えて 60% 削減しました。",
      "オンコール負荷削減では、まず Runbook 整備（初動 5 分で判断できる粒度）、次に Autoheal（Pod restart / Node cordon）、最後にアラート粒度の見直し、という優先順位でやっています。",
    ],
    標準的: [
      "top で CPU 高負荷なプロセスを特定 → strace や perf で詳細を見る、という基本の切り分けを行います。ディスク I/O 起因なら iostat、メモリなら free / vmstat を追加で確認します。",
      "Ansible では roles で機能単位に分割、inventory で環境ごとの変数を管理しています。",
      "SLO は概念としては理解していますが、実務で自分が策定した経験はまだ限定的です。既存の目標値に沿って運用しているのが実態です。",
      "DB 劣化は EXPLAIN で実行計画を見るところから始めます。統計情報の更新は疑う癖がついてきました。",
      "コンテナ化は既存の Docker Compose 環境を運用している程度で、k8s への移行は PoC 段階です。",
    ],
    浅い: [
      "負荷調査は基本的に上位者と一緒に見ています。top や df を見て報告する、というレベルです。",
      "自動化は勉強中で、まだ実案件で書いた経験はありません。書籍で学習しています。",
      "SLO は言葉としては知っていますが、実運用にはまだ関わっていません。",
      "DB の切り分けは上位者が主導で、私は補助的にログを集める程度です。",
    ],
  },
  Dev: {
    深い: [
      "設計レビューでは、拡張性より先に責務分離を確認します。1 モジュールが担う責務が単数かどうか、テストのしにくさが責務の混在サインになっていないかを見ます。特にドメインモデルとインフラ層の依存方向は必ず確認します。",
      "テスト戦略は Test Pyramid を基本に、UI Component テストを厚めに、E2E は主要導線のみに絞っています。unit / integration の境界は「外部 I/O があるか」で分けています。",
      "TypeScript の型は業務では Conditional Types と Template Literal Types まで積極的に使います。特に API のレスポンス型を Zod スキーマから逆算する pattern で、フロント／バック間の型齟齬をコンパイル時に潰しています。",
      "本番障害の切り分けは、Sentry のスタックトレース → 影響ユーザの再現条件を絞る → ローカルで再現 → 修正、の順です。直近では Safari だけで発生する Intersection Observer の挙動差が原因でした。",
      "レガシー保守案件でのリファクタは、変更頻度（git log で確認）× ビジネス重要度で優先順位を付けます。テストゼロ領域には必ずゴールデンテストを先に敷いてからリファクタします。",
      "後輩レビューでは、指摘は 3 段階（Must / Should / Consider）に分けて、Must 以外は理由を必ず添えて意図の言語化を促します。心理的安全性のため、まず良い点を 1 つ以上コメントしてから改善提案します。",
    ],
    標準的: [
      "型システムは基本的な Generics と Utility Types を使うレベルで、Conditional Types や Template Literal Types は必要な時に調べて使います。",
      "テストは unit + integration が中心で、E2E は Playwright を導入したばかりで主要 3 導線のみです。",
      "設計レビューは責務分離と命名を主に見ています。テスト容易性まで意識できるかは、案件によって差があります。",
      "障害切り分けは Sentry と Datadog のログを組み合わせて再現条件を絞る、というやり方が中心です。",
      "レガシー保守は影響範囲を先に見て、テストを追加してから改修する pattern を意識しています。",
    ],
    浅い: [
      "型はプリミティブと interface 定義くらいまでで、高度な型は勉強中です。any や as を減らすことを意識しています。",
      "テストは書いた経験が浅いです。個人開発でユニットテストを書き始めた段階です。",
      "設計レビューは受ける側で、指摘の意図を理解して次に活かす、というレベルです。",
      "障害対応は Runbook に沿って進めるレベルで、原因調査は上位者が主導です。",
    ],
  },
  PMO: {
    深い: [
      "遅延兆候の早期発見は EVM の CPI / SPI が有効ですが、それだけでは遅すぎることが多いです。実務ではメンバの残業時間、Slack の質問頻度、レビュー滞留数など先行指標を組み合わせて Weekly でモニタリングしています。",
      "経営層報告は結論先出し、判断を仰ぐ事項を明示、根拠は appendix に、という 3 部構成を徹底しています。1 スライド 1 メッセージ、指標は必ず前週比を併記します。",
      "課題管理では起票基準を明文化して、Effort × Impact マトリクスで優先度を付けます。ステータス定義は 5 段階に絞って、レビュー会は週次で 30 分固定です。",
      "リスクレジスタは月次で棚卸すのがオススメです。発生確率と影響度は数値評価にして、対応計画に期限を必ず入れます。運用が形骸化しないよう、リスクオーナーを個人名で指定します。",
      "PMO とスクラムマスターの違いは、PMO が上位ステークホルダーの意思決定支援、スクラムマスターがチームの障害除去、と説明しています。役割の重複は「意思決定範囲」で線引きです。",
      "PJ ローンチ直後の PMO でまずやるのは、①WBS ベースライン化 ②体制図確定 ③週次報告経路の合意 ④初期リスクの識別、の 4 点セットです。ここが緩いと 3 ヶ月後に苦労します。",
    ],
    標準的: [
      "遅延兆候はまず担当者ヒアリングと WBS 進捗差分で拾います。CPI / SPI も見ますが、実務では担当者の反応の変化のほうが早く出る感覚です。",
      "経営層報告では、状況、リスク、必要な意思決定の 3 点セットを 1 ページにまとめる形をとっています。",
      "課題管理は Redmine と Backlog を実運用したことがあります。起票基準は上位者の定めたものに従っています。",
      "リスクレジスタは月次で見直しています。テンプレは前案件のものを流用することが多いです。",
      "PJ ローンチ直後は WBS と体制図の整備をまず優先しています。",
    ],
    浅い: [
      "遅延の兆候は上位者と週次で棚卸する場に同席しています。自分で仮説を持って判断する経験はまだ限定的です。",
      "経営層への報告資料は上位者が作り、自分は素材集めを担当しています。",
      "課題管理は Excel での更新業務が中心で、Jira などの高度な運用はこれから学ぶ段階です。",
      "リスクレジスタの運用は先輩の指示に従って更新しているレベルです。",
    ],
  },
  ITSupport: {
    深い: [
      "起動しない Windows 端末では、電源ランプ→BIOS 起動→Windows 起動→ログオン成功の 4 段階に分けて切り分けます。BIOS で止まっているならハード寄り、Windows 起動画面までいくならソフト寄り、と切り分けの深さを段階的に上げます。",
      "Intune / Autopilot 移行では、まず現行 GPO の使用実態を棚卸し、Intune Config Profiles への写像可能性を精査します。移行不可な GPO は代替（Endpoint Manager Scripts など）を検討します。",
      "AD ロックアウトの発生源特定は、DC のセキュリティイベント 4740 でソースコンピュータを取得して、そこの Netlogon ログでどのプロセスから来たかまで追います。よくあるのは古いモバイル端末のキャッシュ資格情報です。",
      "難しい問い合わせでは、まず 30 秒黙ってユーザの困り事を全部話してもらいます。技術用語は絶対に使わず、比喩で置き換えて期待値と現状のギャップを埋めるようにしています。",
      "SLA 遵守のため、毎朝一番に前日残チケットと当日期限のダッシュボードを見ます。担当者負荷が偏っていたら再アサインを提案、上位者への相談チケットは決まった時間に一括処理します。",
      "上位者へのエスカレーションは 3 行フォーマット（事象・影響・切り分け結果）で先出しし、依頼したい判断を明確に書きます。返信を待つ時間がロスなので、選択肢まで用意することが多いです。",
    ],
    標準的: [
      "Windows 端末の起動不良は、まず電源系（バッテリ・AC）を確認し、次に BIOS 到達可否、Windows 起動、と段階的に見ていきます。",
      "AD ロックアウトはイベント ID 4740 でソース PC を特定するのが基本です。",
      "問い合わせ対応では、傾聴を意識して、期待値と現状のギャップを埋めるように心がけています。",
      "SLA 管理は Weekly でチケットの残数を見て、遅延しそうなものにアラートを立てる、という運用です。",
      "エスカレーションでは、事象と影響を簡潔に伝えるようにしています。",
    ],
    浅い: [
      "起動不良の切り分けは Runbook に沿って進めています。予想外の事象は上位者に相談します。",
      "AD 関連はまだ学習段階で、実際の障害対応は上位者と一緒に見ています。",
      "問い合わせ対応は基礎的な内容が中心で、複雑なものは上位者に引き継いでいます。",
      "SLA 管理は上位者が主導で、私はチケット更新の作業レベルです。",
    ],
  },
};
// NW_LOCK は persona.roleKey (=NW) 経由で参照するため、エイリアス不要

function techAnswer(p, q, depth) {
  const pool = TECH_ANSWER_TEMPLATES[p.roleKey]?.[depth] ?? TECH_ANSWER_TEMPLATES.Dev[depth];
  return rand(pool);
}

/** 1 セッション内で tech answer が重複しないよう、シャッフルしたキューを配る */
function makeTechAnswerQueue(p, depth) {
  const pool = TECH_ANSWER_TEMPLATES[p.roleKey]?.[depth] ?? TECH_ANSWER_TEMPLATES.Dev[depth];
  // pool 全体をシャッフルして返す。使い切ったら再度シャッフルして無限に供給
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  let idx = 0;
  return () => {
    if (idx >= shuffled.length) {
      shuffled.sort(() => Math.random() - 0.5);
      idx = 0;
    }
    return shuffled[idx++];
  };
}

function genericAnswer(p, q) {
  // 質問への回答本体（性格別のフレーバー） + 経験の裏付け
  const flavor = {
    積極的: [
      `自分で調べて動くタイプなので、直近では ${q.aim.split(/[／/]/)[0]} を意識して業務を進めています。`,
      `新しい環境でも積極的に発言する方で、${q.aim} 面でチームに貢献できていると感じています。`,
    ],
    慎重: [
      `${q.aim} に関しては、事前にチェックリストを作って抜け漏れを防ぐようにしています。`,
      `${q.aim} の場面では、拙速な判断を避け、必ず一度整理してから行動するタイプです。`,
    ],
    職人肌: [
      `${q.aim} は自分の中でも大切にしている観点で、細部までこだわって取り組んでいます。`,
      `${q.aim} については、深く突き詰めることで自分の価値観を形成してきました。`,
    ],
    のんびり: [
      `${q.aim} については、あまり肩に力を入れすぎないよう心がけています。`,
      `${q.aim} は自然体で向き合うようにしていて、無理せず継続できるやり方を選んでいます。`,
    ],
    戦略的: [
      `${q.aim} は全体最適の観点で考えるようにしていて、部分最適に陥らないよう気をつけています。`,
      `${q.aim} の判断では、短期と中長期の両方の影響を天秤にかけて選ぶことが多いです。`,
    ],
  };
  const line = rand(flavor[p.personality] ?? flavor.慎重);
  return `${line}\n${p.roleLabel} 領域で ${p.yrs} 年やってきた中でも、この観点は特に意識してきました。`;
}

function buildMinutes(persona, questions) {
  const allQ = [...questions.nontech, ...questions.tech];

  // 実面談の再現: ⭐ (必須) は必ず訊く、残りは 70% ランダム採用。
  // 合計問数は 15〜全問（1 時間程度の一次面談を想定）。
  const starred = allQ.filter((q) => q.star);
  const nonStarred = allQ.filter((q) => !q.star).filter(() => chance(0.7));
  const askedRaw = [...starred, ...nonStarred];
  // 最低 15 問、最大 all の範囲でトリム。
  const askedCount = Math.max(15, Math.min(allQ.length, askedRaw.length));
  // 質問順は入力順（人間性 → 技術）を維持する（実面談の流れに合わせる）
  const questionOrder = new Map(allQ.map((q, i) => [q.key, i]));
  const asked = askedRaw.slice(0, askedCount).sort((a, b) => questionOrder.get(a.key) - questionOrder.get(b.key));

  // tech answer が同セッション内で重複しないよう、シャッフルキューを使う
  const depth = persona.skill === "high" ? "深い"
    : persona.skill === "mid" ? "標準的"
      : "浅い";
  const techQueue = makeTechAnswerQueue(persona, depth);

  // 面接日時（作成日時 → 質問公開 → 面談 という遷移を模して、ある程度過去）
  const interviewDate = new Date(Date.now() - randInt(1, 21) * 86400_000);
  const interviewer1 = rand(["山田", "斉藤", "村上", "近藤", "松本"]);
  const interviewer2 = rand(["田中", "小林", "橋本", "西村"]);

  const lines = [];
  lines.push(`# 面談メモ（一次面接）`);
  const startHour = randInt(10, 17);
  lines.push(`- 日時: ${interviewDate.toLocaleDateString("ja-JP")} ${pad(startHour)}:00〜${pad(startHour + 1)}:00`);
  lines.push(`- 面談者: ${persona.name}（${persona.age}歳 / 応募ロール: ${persona.roleLabel}）`);
  lines.push(`- 面接官: ${interviewer1}（技術面談） / 記録: ${interviewer2}`);
  lines.push(`- 実施形態: ${chance(0.7) ? "オンライン (Zoom)" : "対面（本社会議室）"}`);
  lines.push("");
  lines.push(`## アイスブレイク`);
  lines.push(`- 冒頭 5 分で軽く自己紹介・アイスブレイク。${rand([
    "オフィスまでの通勤経路の話題で入る",
    "最近読んだ技術書について雑談",
    "共通の知人（前職の元同僚）の話題",
    "候補者の在住エリアと弊社オフィスの立地について",
  ])}。緊張が解けた段階で本題へ。`);
  lines.push("");
  lines.push(`## Q&A`);
  for (const q of asked) {
    const section = q.key.startsWith("T") ? "【技術】" : "【人間性】";
    lines.push(`### ${section} ${q.key}. ${q.q}`);
    lines.push(`  狙い: ${q.aim}`);
    const answer = q.key.startsWith("T") ? techQueue() : answerFor(persona, q);
    lines.push(`A: ${answer}`);
    // 面接官の追い質問（50% で発生）
    if (chance(0.5)) {
      const follow = followupPrompt(persona, q);
      lines.push(`Q(追い): ${follow.prompt}`);
      lines.push(`A: ${follow.answer}`);
    }
    lines.push("");
  }

  lines.push(`## 面接官コメント`);
  lines.push(`### 話し方・第一印象`);
  lines.push(`- ${impressionForPersonality(persona)}`);
  lines.push(`- ${rand([
    "服装・所作ともに問題なし。",
    "オンラインだが背景・音声環境は整えられており、事前準備が伺える。",
    "笑顔と適切なアイコンタクトあり。",
    "早口気味だが、内容は整理されている。",
  ])}`);
  lines.push(``);
  lines.push(`### 志望動機・カルチャーフィット`);
  lines.push(`- ${impressionForMotivation(persona)}`);
  lines.push(`- ${rand([
    "弊社の技術ブログを継続的にフォローしている旨の言及あり。事前準備の深さは加点。",
    "面接官の逆質問（弊社への質問）が具体的（開発フロー・評価制度・オンコール体制）。",
    "3〜5 年後のキャリア像と弊社ポジションの整合性は概ね取れている。",
    "配属予定チームの人数・技術スタックについて具体的な問い合わせあり、実務イメージが持てている印象。",
  ])}`);
  lines.push(``);
  lines.push(`### 技術面`);
  lines.push(`- ${impressionForSkill(persona)}`);
  lines.push(`- ${rand([
    "設計判断の際に「なぜそう選んだか」を語れており、根拠が明確。",
    "実装レベルの深掘りには即答できたが、抽象的な設計方針の議論には時間を要した。",
    "得意領域と苦手領域を自己認識しており、成長意欲も感じられる。",
    "業務外の学習継続がヒアリングから見えており、伸びしろは十分。",
  ])}`);
  lines.push(``);
  lines.push(`### 逆質問での確認事項`);
  const questions_asked = pickN([
    "配属予定チームの現在の課題感",
    "オンコール当番の頻度と交代ルール",
    "評価制度と昇格タイミング",
    "リモートワーク比率と出社頻度",
    "研修制度・学習支援の予算",
    "技術選定の意思決定プロセス",
    "副業/兼業の可否",
    "コードレビュー文化の実態",
  ], randInt(3, 5));
  questions_asked.forEach((q) => lines.push(`- ${q} について質問あり`));
  lines.push(``);
  lines.push(`### 総合所感`);
  lines.push(`- ${overallImpression(persona)}`);

  return lines.join("\n");
}

/** 追い質問（Q & A ペア） */
function followupPrompt(p, q) {
  const isTech = q.key.startsWith("T");

  if (isTech) {
    if (p.skill === "high") {
      return {
        prompt: rand([
          "逆に選ばなかった手法とその理由を教えてください。",
          "そのアプローチのリスクを 1 つ挙げるとしたら？",
          "同じシチュエーションで、今ならもっと良いやり方があるとしたら？",
          "その判断は上長との合意はどうやって取りましたか？",
        ]),
        answer: rand([
          "対抗案として X も検討しました。ただし運用コストの試算で年間 300 万円ほど差が出て、当時の予算制約から採用しませんでした。",
          "リスクとしては学習コストの高さです。チームに 2 名 SME を確保できないと、単一障害点になりかねません。",
          "今なら OpenTelemetry の導入をより早期に組み込むと思います。当時は成熟度不足で見送りましたが、現在は本番投入例も増えました。",
          "上長には、事前に比較表と PoC 結果を持って 1on1 で相談し、SC 前に合意を作りました。SC は追認の場という位置付けにしています。",
        ]),
      };
    }
    if (p.skill === "mid") {
      return {
        prompt: rand([
          "具体的な数値（規模・件数）で補足できますか？",
          "その判断の際、上長との合意はどうやって取りましたか？",
          "同じ状況で失敗した経験があれば教えてください。",
        ]),
        answer: rand([
          `対象システムは約 ${randInt(30, 100)} サーバ、月間 ${randInt(100, 500)} 万リクエストのオーダーでした。`,
          "上長には設計方針を 1 枚のドキュメントにまとめて事前レビューをもらい、その上で SC に諮る流れです。",
          "以前類似の判断で、初期見積もりを甘く見て後半で工数が膨らんだ経験があります。以降は必ずバッファを 20% 積むようにしています。",
        ]),
      };
    }
    return {
      prompt: rand([
        "その用語（例: BGP/SLO/型システム）を、非エンジニアに説明するとしたら？",
        "実際にその判断に自分で関わった経験はありますか？",
        "上位者の判断を横で見ていて、自分ならどうすると思いましたか？",
      ]),
      answer: rand([
        "非エンジニアには「複数の道の中から一番安全で速いルートを選ぶ仕組み」と説明します。専門用語は使わないよう心がけました。",
        "正直、自分単独で判断まで持って行った経験はまだ限定的です。次の案件では主担当を任せてもらえるよう、いま設計書を書く練習を進めています。",
        "上位者は瞬時に判断していましたが、自分ならまず 30 分ドキュメントを読み込んで、複数案を並べてから決めると思います。判断の型を身につけている最中です。",
      ]),
    };
  }

  // 人間性系の追い
  return {
    prompt: rand([
      "その事例で、周囲の反応はどうでしたか？",
      "同じ状況が明日起こったら、今回学んだことをどう活かしますか？",
      "そのやり方はチーム内でも共有されていますか？",
      "うまくいった要因を、自分の性格 or 環境どちらだと分析しますか？",
    ]),
    answer: rand([
      "周囲からは「そこまで踏み込むと思わなかった」と言われました。SC でも上長経由でポジティブなフィードバックをもらいました。",
      "次回類似の状況では、初期に上長を 15 分だけ巻き込むことで意思決定を早めるのを狙うと思います。",
      "チーム内で振り返り会を開いて共有しました。今は Wiki に「事例集」として蓄積するようにしています。",
      "半々だと思いますが、環境（心理的安全性のある上長）に助けられた要素が大きいです。同じ性格でも別のチームなら難しかったかもしれません。",
    ]),
  };
}

/** 面接官の総合所感（一次面接後の一言メモ） */
function overallImpression(p) {
  if (p.skill === "high") {
    return rand([
      "総じて即戦力レベルの実力を確認できた。二次面接（現場マネージャ / CTO）に進めたい。オファーコンディションの目線合わせも次工程で。",
      "技術・人物ともに期待値超え。カルチャーフィットも問題なく、二次以降で職務範囲と処遇のすり合わせに入りたい。",
      "候補者側の志望度も高そうな印象。二次面接をなるべく早く設定して、内定までのリードタイムを縮めたい。",
    ]);
  }
  if (p.skill === "mid") {
    return rand([
      "実務ベースは標準的で不安なし。二次で応用問と設計判断の深さを再確認したい。オファー時のグレード判断は現場面談後。",
      "全体として合格ラインは超えている。二次面接では現場マネージャと相性確認 + より深い技術検証を行いたい。",
      "人物面は問題なく、技術面は伸びしろも見える。二次面接後に判断で問題なしと思われる。",
    ]);
  }
  return rand([
    "現時点では要件レンジ内ではあるが、経験の絶対量が少ない。オンボーディング体制が整っている前提であれば検討可能。二次で現場マネージャの評価を仰ぎたい。",
    "人物面は好印象、技術面は基礎はあるが応用の場面で不安が残る。ジュニア枠での採用と伴走体制での育成を前提とするなら検討可能。",
    "全体的にはボーダーラインの候補。二次面接での現場適合性次第で判断したい。合わなければ丁重にお見送りが妥当。",
  ]);
}

function followupAnswer(p) {
  if (p.skill === "high") return "選ばなかった選択肢としては X もありましたが、運用コストと拡張性の観点で今回の判断としました。";
  if (p.skill === "low") return "すみません、正確な定義は自信がないので、この場では『多分こういう意味』というレベルでしか答えられません。持ち帰りたいです。";
  return "規模感で言うと、対象システムは ~50 サーバ、月間 ~200 万リクエストのオーダーでした。";
}

function impressionForPersonality(p) {
  const map = {
    積極的: "明るくハキハキ、質問への答えが早い。自ら話題を広げる場面あり。",
    慎重: "落ち着いた口調で丁寧。回答前に一呼吸置いて構造化してから話す傾向。",
    職人肌: "深いところに触れると熱量が上がる。技術詳細は明らかに強い。",
    のんびり: "柔らかい印象。ペースは緩やかだが、内容自体は的を得ている。",
    戦略的: "俯瞰視点の発言が多く、意思決定プロセスへの言及が自然。",
  };
  return map[p.personality] ?? "特に癖のない自然な印象。";
}

function impressionForMotivation(p) {
  if (p.background === "業界転向") return "IT への転向動機は明確。前職経験を活かす意欲も感じられる。";
  if (p.background === "ブランク明け") return "ブランクをカバーしようとする学習意欲が伝わってきた。";
  return "志望動機と現在のキャリア観に大きな乖離はなし。";
}

function impressionForSkill(p) {
  const map = {
    high: "実装レベルまで踏み込んだ議論ができる。設計判断の根拠も明確に語れる。",
    mid: "基本は押さえており、応用問いには若干迷う場面あり。実務範囲は標準的。",
    low: "基礎は勉強中。実務経験の絶対量が少なく、実装の深さは今後の伸びしろ。",
  };
  return map[p.skill];
}

/* ────────────────────────  ⑤ 評価  ──────────────────────── */

/**
 * persona.skill → base スコアを 0〜5 で決めて、そこに ±0.5 のノイズを混ぜる。
 * high: 3.8〜4.6 中心、mid: 3.0〜3.8 中心、low: 2.0〜3.0 中心。
 */
function baseScoreFor(skill) {
  if (skill === "high") return 3.8 + Math.random() * 0.8;
  if (skill === "mid") return 3.0 + Math.random() * 0.8;
  return 2.0 + Math.random() * 1.0;
}

/** 性格による軸バイアス（人間性/技術力に加味） */
function personalityBias(personality) {
  const bias = {
    主体性: 0, コミュニケーション力: 0, 学習意欲: 0,
    専門知識: 0, 問題解決力: 0, 設計力: 0,
  };
  if (personality === "積極的") { bias.主体性 += 0.4; bias.コミュニケーション力 += 0.3; }
  if (personality === "慎重") { bias.設計力 += 0.3; bias.問題解決力 += 0.2; bias.主体性 -= 0.1; }
  if (personality === "職人肌") { bias.専門知識 += 0.4; bias.設計力 += 0.2; bias.コミュニケーション力 -= 0.2; }
  if (personality === "のんびり") { bias.コミュニケーション力 += 0.2; bias.主体性 -= 0.3; }
  if (personality === "戦略的") { bias.設計力 += 0.3; bias.問題解決力 += 0.3; bias.学習意欲 += 0.1; }
  return bias;
}

function evaluationFor(persona, questions, minutes) {
  const base = baseScoreFor(persona.skill);
  const bias = personalityBias(persona.personality);

  const rateAxis = (name) => {
    const noise = (Math.random() - 0.5) * 0.6;
    return clampScore(base + (bias[name] ?? 0) + noise);
  };

  const 人間性小軸 = NONTECH_AXES.map((a) => ({
    軸: a.名前,
    スコア: rateAxis(a.名前),
    根拠: reasonFor(persona, "人間性", a.名前, questions),
  }));
  const 技術力小軸 = TECH_AXES.map((a) => ({
    軸: a.名前,
    スコア: rateAxis(a.名前),
    根拠: reasonFor(persona, "技術力", a.名前, questions),
  }));

  const 人間性スコア = weightedAvg(人間性小軸.map((s) => ({
    v: s.スコア, w: NONTECH_AXES.find((x) => x.名前 === s.軸)?.重み ?? 1,
  })));
  const 技術力スコア = weightedAvg(技術力小軸.map((s) => ({
    v: s.スコア, w: TECH_AXES.find((x) => x.名前 === s.軸)?.重み ?? 1,
  })));

  const flat = [
    ...人間性小軸.map((s) => ({ v: s.スコア, w: NONTECH_AXES.find((x) => x.名前 === s.軸)?.重み ?? 1 })),
    ...技術力小軸.map((s) => ({ v: s.スコア, w: TECH_AXES.find((x) => x.名前 === s.軸)?.重み ?? 1 })),
  ];
  const 総合スコア = weightedAvg(flat);

  const 合否 = 総合スコア >= PASS_LINE ? "合格"
    : 総合スコア >= NORMAL_LINE ? "普通"
      : "不合格";

  const 自己解決レベル = clampScore(base - 0.3 + Math.random() * 0.6);

  return {
    人間性: { スコア: 人間性スコア, 小軸評価: 人間性小軸 },
    技術力: { スコア: 技術力スコア, 小軸評価: 技術力小軸 },
    自己解決レベル,
    総合スコア,
    合否,
    良い点: goodPoints(persona),
    懸念点: badPoints(persona, 総合スコア),
  };
}

function reasonFor(p, category, axis, questions) {
  // 質問と回答の一部を根拠に引用する形（真の面談の記録らしさ）
  const roleLabel = p.roleLabel;
  const src = {
    主体性: p.personality === "積極的"
      ? `Q2 の改善提案事例（${roleLabel} 領域の運用ドキュメント最新化）が具体的で、自ら課題設定して動き、上位者を巻き込んだ実績が確認できた。Q8 の意見対立時の合意形成でも先手を打つ姿勢が読み取れた。`
      : p.personality === "戦略的"
        ? `Q2・Q8 での改善提案・合意形成の動きが全体像を俯瞰したもので、部分最適に陥らない判断力が確認できた。`
        : `Q2 の改善事例は具体だが、規模がチーム内に留まる。自走の範囲は限定的で、今後の課題として要確認。`,
    コミュニケーション力: p.personality === "職人肌"
      ? `Q1 の自己紹介と技術セクションの詳細度は高いが、Q9 の後輩指導の話で専門用語をそのまま使う場面があり、非エンジニアへの噛み砕きは今後の課題。`
      : p.skill === "high"
        ? `Q1 の自己紹介と Q6 の志望動機の一貫性が高く、聞き手を意識した構造化（結論先出し・数値裏付け）が見られた。Q8 の対立解消エピソードも具体的。`
        : p.skill === "mid"
          ? `Q1・Q6 は概ね伝わる。ただし Q8 の合意形成事例は主観中心で客観的な意思決定プロセスの説明はやや弱い。`
          : `Q1・Q6 とも大枠は伝わるが、規模感や数値の裏付けが薄い場面が目立った。`,
    学習意欲: p.background === "独学出身" || p.background === "業界転向"
      ? `Q4 で直近半年の学習投資（週 ${randInt(6, 12)} 時間）を具体的に語り、学習習慣が定着していることが確認できた。Q10 の影響を受けた人物のエピソードにも一貫性あり。`
      : p.skill === "high"
        ? `Q4 の学習事例で、書籍 → 実装 → 社内発信までの一連のサイクルを回している点を評価。Q11 の業務外活動も充実。`
        : p.skill === "mid"
          ? `Q4 の学習は資格試験と業務キャッチアップが中心。能動的な学習量は標準的で、飛躍的な自走感はまだ限定的。`
          : `Q4 は「業務で使う技術のキャッチアップ」程度に留まる。伸びしろはあるが、現時点では受動的な学習が中心。`,
    専門知識: p.skill === "high"
      ? `T1・T3・T9 で ${roleLabel} 領域の詳細に踏み込んだ回答があり、実務での深い理解と設計判断の経験が確認できた。追い質問への即答も安定。`
      : p.skill === "mid"
        ? `T1・T3 で基本原則の説明は問題なし。応用問（T4・T9）ではやや浅くなる場面あり、上位者の判断を横で見て学んでいる段階の印象。`
        : `T1・T3 は座学レベルの説明。実務での判断経験がまだ少なく、Runbook 依存の色が強い。`,
    問題解決力: p.skill === "high"
      ? `T3・T10 の障害・パフォーマンス切り分け手順が段階的で、原因特定 → 恒久対策までの流れが明確。過去実例の数値（MTTR ${randInt(5, 20)} 分など）も具体的。`
      : p.skill === "mid"
        ? `T3 の切り分け手順は基本を押さえている（top → strace → 詳細調査）。深掘り追い質問には答えられたが、初手の判断は上位者と一緒に見ている印象。`
        : `T3 は Runbook に従うレベル。仮説駆動の切り分け経験はまだ限定的で、経験値の絶対量が不足。`,
    設計力: p.personality === "戦略的"
      ? `T1・T9 で設計上のトレードオフを明確に語れており、判断根拠が定量的（コスト・可用性・拡張性の 4 軸比較）。判断プロセスも仕組み化されている印象。`
      : p.personality === "職人肌"
        ? `T1・T3 で細部までこだわった設計判断が見られる。ただし T12 での全体最適の観点はもう一歩深めたい。`
        : p.skill === "high"
          ? `T1・T3 で設計判断の理由付けが明快、実務での責任範囲も広い。テックリード候補として問題なし。`
          : `T1・T3 は上位者の設計判断を横で見て学んでいる段階、自身での判断経験は少ない。今後の伸びしろは十分。`,
  };
  return src[axis] ?? `${axis} は面談内容全体を通して標準的な水準。`;
}

/**
 * 良い点: 3〜5 項目、根拠付きで具体的に。EVAL_OUTPUT_SCHEMA の「良い点」に相当。
 */
function goodPoints(p) {
  const points = [];
  if (p.personality === "積極的") {
    points.push(`Q2 の改善提案事例が具体的で、${p.roleLabel} 領域の運用課題を自ら設定して上位者巻き込みまで実施した実績が明確。同様の動きが Q8 の合意形成でも確認できた。`);
  }
  if (p.personality === "戦略的") {
    points.push(`Q7 のキャリアプランと Q12 の価値観が整合しており、全体最適志向が一貫している。SC 報告や意思決定支援ができる素養が見える。`);
  }
  if (p.personality === "職人肌") {
    points.push(`T1・T3 での技術詳細への深い理解が確認できた。深掘り追い質問にも即答でき、SME としての伸びしろが感じられる。`);
  }
  if (p.personality === "慎重") {
    points.push(`T5・T12 の運用堅牢性への配慮が具体的（手順書・切り戻し条件・立会体制）。品質重視のカルチャーとフィットする。`);
  }
  if (p.personality === "のんびり") {
    points.push(`Q11 の趣味・業務外活動と Q5 のストレス対処の一貫性が高く、長期在籍と燃え尽き防止の観点で安心感がある。`);
  }
  if (p.skill === "high") {
    points.push(`実装レベル (T2・T10) から設計判断 (T1・T9) まで自走できるレベル。テックリード候補として次工程への推薦も検討可。`);
  }
  if (p.background === "独学出身") {
    points.push(`Q4・Q11 で独学ベースの継続的な学習習慣（週 ${randInt(6, 12)} 時間）が定着しており、自己成長性の高さは特筆すべき。`);
  }
  if (p.background === "業界転向") {
    points.push(`Q10 の影響を受けた人物・出来事の話から、キャリアの一貫した動機が確認できた。前職ドメイン知識も強みとして活かせそう。`);
  }
  // 志望動機（全 persona 共通で 1 個追加）
  points.push(`Q6 の志望動機は具体的（技術ブログのフォロー / 面接前の情報収集 / キャリアプランとの結びつき）で、事前準備の深さから志望度の高さが伺える。`);

  // 3〜5 項目に絞る（多すぎる場合はトップ 5）
  return points.slice(0, 5).map((s) => `・${s}`).join("\n");
}

/**
 * 懸念点: 3〜5 項目、事実ベースで具体的に。EVAL_OUTPUT_SCHEMA の「懸念点」に相当。
 */
function badPoints(p, score) {
  const points = [];
  if (p.skill === "low") {
    points.push(`T1・T3 で実務での判断経験の浅さが顕在化した。独力で難易度の高い問いに向き合えるかは、伴走体制の設計次第。オンボーディング 3 ヶ月で丁寧なペア作業が必要。`);
  }
  if (p.personality === "のんびり") {
    points.push(`Q11 の業務外活動は充実だが、Q5 のストレス対処で速度感を求められる場面での適応は履歴書と面談からは読み取れず、短期スパイク案件でのストレッチは要確認。`);
  }
  if (p.personality === "職人肌") {
    points.push(`T1・T3 の技術詳細は強いが、T12 での全体最適・幅の広さの観点はもう一歩。スコープを絞りすぎる傾向がないか、案件アサインで注意が必要。`);
  }
  if (p.personality === "積極的") {
    points.push(`Q2・Q8 で自己主張の強さが目立った場面あり。チーム内の対立を先鋭化させないか、上長との定期的な擦り合わせが必要そう。`);
  }
  if (p.background === "業界転向") {
    points.push(`IT ドメイン理解の深さは今後 1〜2 年での成長次第。ドメイン特化案件（金融/公共/EC）のアサインは慎重に検討。`);
  }
  if (p.background === "ブランク明け") {
    points.push(`最新スタック（クラウドネイティブ / モダンフレームワーク）のキャッチアップ状況は要確認。初期は伴走体制を厚めに。`);
  }
  if (score < NORMAL_LINE) {
    points.push(`T3・T4 の応用問で基本水準を下回る回答が複数あり、当面のスコープは限定的にする期待値調整が必要。半年後の再評価を前提とした OJT 計画が望まれる。`);
  }
  // 定着性（全 persona 共通、20% で追加）
  if (chance(0.2)) {
    points.push(`Q7 のキャリアプランで、弊社ポジションと 3 年後の目標との整合性がやや薄い。2 次面接で長期在籍の確度を再確認したい。`);
  }
  if (points.length === 0) {
    points.push(`大きな懸念は見当たらないが、二次面接でチームフィット・処遇合意・入社時期の擦り合わせを再確認したい。`);
    points.push(`逆質問で確認された「オンコール当番の頻度」への反応から、負荷許容度は事前合意が望ましい。`);
  }

  return points.slice(0, 5).map((s) => `・${s}`).join("\n");
}

/* ────────────────────────  1 セッション生成  ──────────────────────── */

/**
 * status 分布に基づき target を選び、そこまで進行させる。
 * 各セッションは createdAt からの経過時間を持たせ、closedAt を評価済の場合のみ設定。
 */
function generateSession() {
  const role = rand(ALL_ROLES);
  // role.役割 は人間可読なロール名（例: "ネットワークエンジニア"）、無ければ id で代替
  const persona = makePersona(role.id, role["役割"] ?? role.id);

  // 作成日時: 過去 20〜120 日（指数分布近似、直近寄りだが最低 20 日は確保）。
  // 20 日下限は「後段の frozenAt/minutes/eval を最大 +15 日ずらしても未来に飛ばない」ため。
  const daysAgo = 20 + Math.floor(Math.pow(Math.random(), 2) * 100);
  const createdAt = addDays(new Date(), -daysAgo);
  const id = `${persona.name}_${role.id}_${fmtStamp(createdAt)}`;

  // ステータス分布
  const status = pickWeighted([
    ["編集中", 1], ["質問公開", 1], ["面談済", 2], ["評価済", 6],
  ]);

  const sessionDir = path.join(SESSIONS_DIR, id);
  fs.mkdirSync(sessionDir, { recursive: true });

  // --- ① 候補者要約
  const summary = candidateSummary(persona, role);
  const candidateMode = chance(0.65) ? "api" : "paste";
  const candidateSavedAt = capPast(addDays(createdAt, randInt(0, 2)));
  const candidate = {
    mode: candidateMode,
    要約: summary.text,
    updatedAt: iso(candidateSavedAt),
    ...(candidateMode === "api" ? { provider: "anthropic" } : {}),
  };
  writeJson(path.join(sessionDir, "candidate.json"), candidate);

  // --- SessionMeta（初期）
  const meta = {
    id,
    氏名: persona.name,
    役割: role.id,
    作成日時: iso(createdAt),
    status: "編集中",
    closedAt: null,
    result: "未確定",
    hold: chance(0.05),
  };

  if (status === "編集中") {
    writeJson(path.join(sessionDir, "session.json"), meta);
    return { id, status };
  }

  // --- ② 条件凍結
  const snapshot = {
    role,
    eval: EVAL_CRITERIA,
    frozenAt: iso(capPast(addDays(candidateSavedAt, randInt(1, 3)))),
  };
  writeJson(path.join(sessionDir, "conditions_snapshot.json"), snapshot);

  // --- ③ 質問リスト
  const q = buildQuestionsText(role.id);
  const questionsMode = chance(0.6) ? "api" : "paste";
  const questionsSavedAt = capPast(addDays(new Date(snapshot.frozenAt), randInt(0, 2)));
  const questions = {
    mode: questionsMode,
    rawText: q.rawText,
    items: q.items,
    updatedAt: iso(questionsSavedAt),
  };
  writeJson(path.join(sessionDir, "questions.json"), questions);
  meta.status = "質問公開";

  if (status === "質問公開") {
    writeJson(path.join(sessionDir, "session.json"), meta);
    return { id, status };
  }

  // --- ④ 面談内容
  const minutesText = buildMinutes(persona, q);
  const minutesSavedAt = capPast(addDays(questionsSavedAt, randInt(1, 7)));
  writeJson(path.join(sessionDir, "minutes.json"), {
    text: minutesText,
    updatedAt: iso(minutesSavedAt),
    summarized: chance(0.15),
  });
  meta.status = "面談済";

  if (status === "面談済") {
    writeJson(path.join(sessionDir, "session.json"), meta);
    return { id, status };
  }

  // --- ⑤ 評価
  const evalMode = chance(0.55) ? "api" : "paste";
  const evalSavedAt = capPast(addDays(minutesSavedAt, randInt(0, 3)));
  const evalCore = evaluationFor(persona, q, minutesText);
  const evaluation = {
    mode: evalMode,
    ...evalCore,
    updatedAt: iso(evalSavedAt),
    ...(evalMode === "api" ? { provider: "anthropic" } : {}),
  };
  writeJson(path.join(sessionDir, "evaluation.json"), evaluation);

  meta.status = "評価済";
  meta.closedAt = iso(evalSavedAt);
  meta.総合スコア = evalCore.総合スコア;
  meta.合否 = evalCore.合否;

  // result 分布: 合格 → 採用 60% / 未確定 30% / 不採用 10%
  //             普通 → 未確定 60% / 採用 20% / 不採用 20%
  //             不合格 → 不採用 70% / 未確定 25% / 採用 5%（例外）
  if (evalCore.合否 === "合格") {
    meta.result = pickWeighted([["採用", 6], ["未確定", 3], ["不採用", 1]]);
  } else if (evalCore.合否 === "普通") {
    meta.result = pickWeighted([["未確定", 6], ["採用", 2], ["不採用", 2]]);
  } else {
    meta.result = pickWeighted([["不採用", 7], ["未確定", 2.5], ["採用", 0.5]]);
  }

  writeJson(path.join(sessionDir, "session.json"), meta);
  return { id, status, 総合スコア: evalCore.総合スコア, 合否: evalCore.合否, result: meta.result };
}

/* ────────────────────────  main  ──────────────────────── */
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

const counts = { 編集中: 0, 質問公開: 0, 面談済: 0, 評価済: 0 };
const scoreCounts = { 合格: 0, 普通: 0, 不合格: 0 };

for (let i = 0; i < COUNT; i++) {
  const r = generateSession();
  counts[r.status] = (counts[r.status] ?? 0) + 1;
  if (r.合否) scoreCounts[r.合否]++;
  const scoreStr = r.総合スコア !== undefined ? ` score=${r.総合スコア} (${r.合否}/${r.result})` : "";
  console.log(`  ✓ [${String(i + 1).padStart(3, " ")}/${COUNT}] ${r.status}  ${r.id}${scoreStr}`);
}

console.log("\n─────────── 生成結果 ───────────");
console.log(`  ステータス分布: 編集中=${counts.編集中}  質問公開=${counts.質問公開}  面談済=${counts.面談済}  評価済=${counts.評価済}`);
console.log(`  合否分布:       合格=${scoreCounts.合格}  普通=${scoreCounts.普通}  不合格=${scoreCounts.不合格}`);
console.log(`  出力先:         ${SESSIONS_DIR}`);
console.log("─────────────────────────────────");
console.log("\n✅ 完了。dev server を起動して http://127.0.0.1:3939/list で確認してください。");
console.log("   Excel ミラー (session.xlsx) は Server Action 経由の保存でのみ生成されます。");
console.log("   ミラーが必要な場合は /list から各セッションを開いて 1 度保存してください。");
