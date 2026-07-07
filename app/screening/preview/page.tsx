/**
 * 【デザインプレビュー用の静的ダッシュボード】
 *
 * 目的: 書類選考モードのダッシュボード UI を上司/社長に確認してもらうためのモック。
 * バックエンド未接続。ボタン押下・チェック操作すべてダミー。
 *
 * 構成:
 *   1. ヘッダ + 統計サマリ
 *   2. 新規バッチ投入ゾーン（ドロップ）
 *   3. 現在バッチのランキング（メインコンテンツ）
 *   4. 過去バッチ履歴
 *
 * 実装確定後、このファイルは削除する。
 */

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Filter,
  Info,
  MoreVertical,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";

export const dynamic = "force-static";

export default function ScreeningDashboardPreview() {
  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <PreviewBanner />
      <DashboardHeader />
      <StatsRow />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <DropZoneCard />
          <CurrentBatchCard />
        </div>
        <div className="space-y-6">
          <PastBatchesCard />
          <ComplianceNoteCard />
        </div>
      </div>
      <PreviewFooter />
    </div>
  );
}

/* ───────────── ヘッダとバナー ───────────── */

function PreviewBanner() {
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
      <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
      <div className="flex-1">
        <div className="text-sm font-bold text-foreground">
          書類選考ダッシュボード — デザインプレビュー
        </div>
        <div className="text-xs text-muted-foreground">
          社長確認用の静的モック。ボタン・チェック操作は反応しません。承認後に本実装へ。
        </div>
      </div>
      <Link
        href="/"
        className="text-xs text-muted-foreground hover:text-blue-600 whitespace-nowrap flex items-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" />
        トップへ
      </Link>
    </div>
  );
}

function DashboardHeader() {
  return (
    <div className="flex items-baseline gap-3">
      <h1 className="text-xl font-bold text-foreground">📋 書類選考</h1>
      <span className="text-sm text-muted-foreground">
        履歴書をまとめてアップロード → AI が要約・スコア付け → 面談する人を選ぶ
      </span>
    </div>
  );
}

/* ───────────── 統計サマリ ───────────── */

function StatsRow() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard icon={<FileText className="w-4 h-4" />} label="今月の応募" value="47" sub="+12 先週比" tone="blue" />
      <StatCard icon={<Users className="w-4 h-4" />} label="面談推奨" value="18" sub="38% 通過率" tone="emerald" />
      <StatCard icon={<Award className="w-4 h-4" />} label="内定" value="3" sub="6.4% 決定率" tone="purple" />
      <StatCard icon={<BarChart3 className="w-4 h-4" />} label="累計API費" value="¥1,240" sub="今月" tone="zinc" />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "blue" | "emerald" | "purple" | "zinc";
}) {
  const toneMap = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    zinc: "bg-muted text-foreground/85 border-border",
  }[tone];
  return (
    <div className="bg-card rounded-xl border shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${toneMap}`}>
          {icon}
        </div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      <div className="text-2xl font-bold text-foreground leading-none mb-1">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

/* ───────────── 新規バッチ投入ドロップゾーン ───────────── */

function DropZoneCard() {
  return (
    <div className="bg-card rounded-xl border shadow-sm p-6">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-base font-bold text-foreground">新規バッチ投入</h2>
        <span className="text-xs text-muted-foreground">複数ファイルを一気に処理</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-4">
        {/* 役割セレクタ */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-foreground/85">役割 <span className="text-red-500">*</span></label>
          <div className="border rounded px-3 py-2 text-sm bg-card flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="pill pill-role-nw">NW</span>
              <span className="font-medium text-foreground truncate">ネットワークエンジニア</span>
            </div>
            <span className="text-muted-foreground opacity-70">▼</span>
          </div>
          <div className="text-xs text-muted-foreground">
            全ファイル共通の役割として適用。<br />
            評価基準はこの求人情報から自動抽出。
          </div>
        </div>

        {/* ドロップゾーン */}
        <div className="border-2 border-dashed border-blue-300 bg-blue-50/40 rounded-lg p-6 text-center flex flex-col items-center justify-center">
          <Upload className="w-8 h-8 text-blue-500 mb-2" />
          <div className="text-sm font-medium text-foreground/85 mb-1">
            ここに履歴書 / 職務経歴書 / 技能表をドロップ
          </div>
          <div className="text-xs text-muted-foreground mb-3">
            PDF / Word / Excel ・最大 20 件 / 1件 5MB 以内
          </div>
          <button className="text-xs border rounded px-3 py-1 hover:bg-card bg-card">
            ファイルを選択
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground pt-3 border-t">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-600" />
            AI 要約 + 書類スコアを自動実行
          </span>
          <span className="text-muted-foreground opacity-50">|</span>
          <span>推定コスト: ドロップ後に表示</span>
        </div>
        <button className="bg-secondary text-muted-foreground text-sm px-4 py-1.5 rounded font-medium cursor-not-allowed" disabled>
          ファイルを選択してください
        </button>
      </div>
    </div>
  );
}

/* ───────────── 現在バッチのランキング ───────────── */

function CurrentBatchCard() {
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <header className="px-6 py-4 border-b flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-foreground">最新バッチの結果</h2>
            <span className="pill pill-role-nw">NW</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              2026-07-07 14:32
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            10 名の履歴書を処理・AI 要約 + 書類スコア済 ・処理時間 82 秒 ・実費 ¥248
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="text-xs border rounded px-2 py-1 hover:bg-accent flex items-center gap-1">
            <Filter className="w-3 h-3" /> 推奨のみ
          </button>
          <button className="text-xs border rounded px-2 py-1 hover:bg-accent">
            CSV 出力
          </button>
        </div>
      </header>

      <table className="w-full text-sm">
        <thead className="bg-muted text-muted-foreground text-xs border-b">
          <tr>
            <th className="w-10 text-left px-3 py-2 font-normal">
              <input type="checkbox" className="rounded" />
            </th>
            <th className="w-10 text-left px-2 py-2 font-normal">順位</th>
            <th className="text-left px-3 py-2 font-normal">氏名</th>
            <th className="text-left px-3 py-2 font-normal w-24">スコア</th>
            <th className="text-left px-3 py-2 font-normal w-28">推奨</th>
            <th className="text-left px-3 py-2 font-normal">主要スキル</th>
            <th className="w-12"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          <CandidateRow rank={1} medal="🥇" name="山田太郎" score={87} rec="推奨" skills="Cisco / AWS / CCNP" selected />
          <CandidateRow rank={2} medal="🥈" name="田中花子" score={82} rec="推奨" skills="Juniper / 監視構築 / 6年" selected />
          <CandidateRow rank={3} medal="🥉" name="佐藤次郎" score={74} rec="検討" skills="ヘルプデスク / L2構築" />
          <CandidateRow rank={4} name="鈴木一郎" score={68} rec="検討" skills="運用中心 / 未経験可枠" />
          <CandidateRow rank={5} name="伊藤三郎" score={58} rec="ボーダー" skills="学生 / 資格保有" />
          <CandidateRow rank={6} name="渡辺花奈" score={54} rec="ボーダー" skills="他業種 → IT 転向" />
          <CandidateRow rank={7} name="高橋二郎" score={42} rec="見送り" skills="経験不足" />
          <CandidateRow rank={8} name="松本裕介" score={38} rec="見送り" skills="スキル領域が異なる" />
        </tbody>
      </table>

      <footer className="px-6 py-3 border-t bg-muted flex items-center gap-3">
        <div className="text-xs text-muted-foreground">
          <strong className="text-foreground">2名</strong> を選択中
        </div>
        <div className="flex-1" />
        <button className="text-xs border rounded px-3 py-1.5 hover:bg-card bg-card">
          アーカイブ（6名）
        </button>
        <button className="text-xs border rounded px-3 py-1.5 hover:bg-card bg-card">
          保留に移動
        </button>
        <button className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm px-4 py-1.5 rounded font-medium flex items-center gap-1">
          2名を面談へ進める
          <ArrowRight className="w-4 h-4" />
        </button>
      </footer>
    </div>
  );
}

function CandidateRow({
  rank,
  medal,
  name,
  score,
  rec,
  skills,
  selected,
}: {
  rank: number;
  medal?: string;
  name: string;
  score: number;
  rec: "推奨" | "検討" | "ボーダー" | "見送り";
  skills: string;
  selected?: boolean;
}) {
  const recStyle = {
    推奨: "bg-emerald-100 text-emerald-800",
    検討: "bg-blue-100 text-blue-800",
    ボーダー: "bg-amber-100 text-amber-800",
    見送り: "bg-muted text-muted-foreground",
  }[rec];
  const scoreColor =
    score >= 80 ? "text-emerald-700" : score >= 60 ? "text-blue-700" : score >= 45 ? "text-amber-700" : "text-muted-foreground";
  return (
    <tr className={`hover:bg-accent ${selected ? "bg-blue-50/40" : ""}`}>
      <td className="px-3 py-2.5">
        <input type="checkbox" defaultChecked={selected} className="rounded" />
      </td>
      <td className="px-2 py-2.5 text-center">
        {medal ? (
          <span className="text-lg">{medal}</span>
        ) : (
          <span className="text-xs text-muted-foreground">{rank}</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-foreground">{name}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold leading-none ${scoreColor}`}>{score}</span>
          <div className="w-12 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full ${
                score >= 80
                  ? "bg-emerald-500"
                  : score >= 60
                    ? "bg-blue-500"
                    : score >= 45
                      ? "bg-amber-500"
                      : "bg-zinc-400"
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-xs px-2 py-0.5 rounded font-medium ${recStyle}`}>{rec}</span>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs text-muted-foreground truncate max-w-[24ch]" title={skills}>
          {skills}
        </div>
      </td>
      <td className="px-3 py-2.5 text-right">
        <button className="text-primary hover:underline text-xs flex items-center gap-0.5 ml-auto">
          詳細
          <ChevronRight className="w-3 h-3" />
        </button>
      </td>
    </tr>
  );
}

/* ───────────── 過去バッチ一覧 ───────────── */

function PastBatchesCard() {
  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <header className="px-4 py-3 border-b flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">過去のバッチ</h2>
        <button className="text-xs text-primary hover:underline">すべて見る</button>
      </header>
      <ul className="divide-y">
        <BatchListItem role="Server" roleId="Server" date="2026-07-05" total={8} recommended={3} interviewed={2} passed={1} />
        <BatchListItem role="Dev" roleId="Dev" date="2026-07-03" total={12} recommended={5} interviewed={4} passed={2} />
        <BatchListItem role="NW" roleId="NW" date="2026-06-28" total={6} recommended={2} interviewed={2} passed={1} />
        <BatchListItem role="PMO" roleId="PMO" date="2026-06-20" total={4} recommended={1} interviewed={1} passed={0} />
      </ul>
    </div>
  );
}

function BatchListItem({
  role,
  roleId,
  date,
  total,
  recommended,
  interviewed,
  passed,
}: {
  role: string;
  roleId: string;
  date: string;
  total: number;
  recommended: number;
  interviewed: number;
  passed: number;
}) {
  const rolePill: Record<string, string> = {
    NW: "pill-role-nw",
    Server: "pill-role-sv",
    Dev: "pill-role-dev",
    PMO: "pill-role-pm",
  };
  return (
    <li className="px-4 py-3 hover:bg-accent cursor-pointer flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`pill ${rolePill[roleId] ?? "pill-edit"}`}>{role}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="w-3 h-3" /> {date}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>応募 <strong className="text-foreground">{total}</strong></span>
          <span className="text-muted-foreground opacity-50">·</span>
          <span>推奨 <strong className="text-emerald-700">{recommended}</strong></span>
          <span className="text-muted-foreground opacity-50">·</span>
          <span>面談 <strong className="text-blue-700">{interviewed}</strong></span>
          <span className="text-muted-foreground opacity-50">·</span>
          <span>内定 <strong className="text-purple-700">{passed}</strong></span>
        </div>
      </div>
      <MoreVertical className="w-4 h-4 text-muted-foreground opacity-70 shrink-0" />
    </li>
  );
}

/* ───────────── コンプラ注記カード ───────────── */

function ComplianceNoteCard() {
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <Info className="w-4 h-4 text-amber-700" />
        <div className="text-sm font-bold text-amber-900">AI 判定の取り扱い</div>
      </div>
      <div className="text-xs text-amber-900 leading-relaxed">
        書類スコアと推奨判定は AI が生成した参考情報です。<strong>最終的な採用判断は必ず人間が行ってください</strong>。
        AI の判断根拠は各候補者の詳細画面で確認できます。監査ログに全操作が記録されます。
      </div>
      <div className="text-2xs text-amber-700 flex items-center gap-1 pt-1 border-t border-amber-200">
        <Clock className="w-3 h-3" />
        書類スコアは 30 日で自動削除（保存期間設定に従う）
      </div>
    </div>
  );
}

/* ───────────── フッタ ───────────── */

function PreviewFooter() {
  return (
    <div className="text-center text-xs text-muted-foreground pt-6 border-t space-y-1">
      <div>
        このページは <code className="bg-muted px-1 rounded">/screening/preview</code> の静的モックです。
      </div>
      <div>
        承認後に本実装（バックエンド配線・実データ表示）へ進みます。
      </div>
    </div>
  );
}

/* ───────────── サブ: 詳細画面のポップアウト（現時点は未表示・実装時に追加予定） ───────────── */
// 実装時: 「詳細」クリック → 別画面 /screening/[batchId]/[candidateId] へ遷移。
// 表示内容: ①要約 + AI が挙げた強み・懸念点・スコア内訳 + 履歴書原本ダウンロード + [面談へ進める / アーカイブ]
