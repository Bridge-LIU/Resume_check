import Link from "next/link";

// 提案フレームワークのプレビュー（静的モック）。
// ルーティング上は /preview だが nav には出さない（/manual と同じ扱い）。
// 現行 app/layout.tsx が上部ナビ入りシェルを被せてくるため、
// ここでは「本文領域の中にサイドバー案の見た目を丸ごと描く」形にしている。

type Stage = {
  key: string;
  label: string;
  count: number;
  bg: string;    // カード背景
  fg: string;    // 文字色
};

// 現行 SessionStatus (4) + 合否 (合格/不合格) の 6 分類。
// ※ 編集中→質問公開→面談済→評価済 の 4 状態が正、
//   合格/不合格 は「評価済」の中の 合否 内訳。
const STAGES: Stage[] = [
  { key: "edit", label: "編集中",   count: 12, bg: "bg-zinc-500",   fg: "text-white" },
  { key: "qpub", label: "質問公開", count: 8,  bg: "bg-amber-400",  fg: "text-white" },
  { key: "itv",  label: "面談済",   count: 5,  bg: "bg-violet-500", fg: "text-white" },
  { key: "eval", label: "評価済",   count: 4,  bg: "bg-blue-500",   fg: "text-white" },
  { key: "pass", label: "合格",     count: 21, bg: "bg-emerald-500",fg: "text-white" },
  { key: "fail", label: "不合格",   count: 9,  bg: "bg-rose-500",   fg: "text-white" },
];

// 現行 SessionMeta に揃えた列構成: 日時 / 氏名 / 役割 / 状態 / スコア / 合否 / 採否
type Status = "編集中" | "質問公開" | "面談済" | "評価済";
type Verdict = "合格" | "普通" | "不合格" | null;
type Decision = "採用" | "不採用" | "未確定";

type Row = {
  id: string;
  datetime: string;
  name: string;
  role: string;
  roleTag: "nw" | "sv" | "dev" | "sp" | "pm" | "it";
  status: Status;
  score: number | null;
  verdict: Verdict;
  decision: Decision;
};

const ROWS: Row[] = [
  { id: "s1", datetime: "2026-06-30 10:00", name: "山田 太郎",  role: "ネットワーク", roleTag: "nw",  status: "評価済",   score: 82.4, verdict: "合格",   decision: "採用" },
  { id: "s2", datetime: "2026-07-04 14:00", name: "佐藤 花子",  role: "サーバ",       roleTag: "sv",  status: "面談済",   score: null, verdict: null,     decision: "未確定" },
  { id: "s3", datetime: "2026-07-02 11:30", name: "鈴木 一郎",  role: "開発",         roleTag: "dev", status: "評価済",   score: 71.0, verdict: "普通",   decision: "未確定" },
  { id: "s4", datetime: "2026-07-05 09:00", name: "高橋 明日香",role: "サポート",     roleTag: "sp",  status: "質問公開", score: null, verdict: null,     decision: "未確定" },
  { id: "s5", datetime: "2026-07-06 13:00", name: "田中 健太",  role: "PM",           roleTag: "pm",  status: "編集中",   score: null, verdict: null,     decision: "未確定" },
  { id: "s6", datetime: "2026-06-28 15:00", name: "伊藤 詩織",  role: "情シス",       roleTag: "it",  status: "評価済",   score: 76.2, verdict: "合格",   decision: "採用" },
  { id: "s7", datetime: "2026-06-25 10:00", name: "渡辺 拓也",  role: "開発",         roleTag: "dev", status: "評価済",   score: 48.5, verdict: "不合格", decision: "不採用" },
  { id: "s8", datetime: "2026-07-05 16:00", name: "中村 美咲",  role: "ネットワーク", roleTag: "nw",  status: "面談済",   score: null, verdict: null,     decision: "未確定" },
];

function statusPill(s: Status) {
  switch (s) {
    case "編集中":   return "pill-edit";
    case "質問公開": return "pill-qpub";
    case "面談済":   return "pill-itv";
    case "評価済":   return "pill-eval";
  }
}

function verdictPill(v: Verdict) {
  if (v === "合格")   return "pill-pass";
  if (v === "普通")   return "pill-mid";
  if (v === "不合格") return "pill-fail";
  return null;
}

export default function PreviewPage() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border shadow-sm p-4 text-sm text-zinc-600">
        <div className="flex items-center gap-3">
          <span className="text-2xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            プレビュー
          </span>
          <span>
            サイドバー案（実装はしていません — 見た目確認用の静的モック）
          </span>
          <div className="flex-1" />
          <Link href="/" className="text-blue-600 hover:underline">
            現行の一覧に戻る →
          </Link>
        </div>
      </div>

      {/* ↓ ここから mockup 本体 */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="flex min-h-[720px]">
          <SideBar />
          <div className="flex-1 flex flex-col bg-zinc-50">
            <TopBar />
            <div className="p-6 space-y-6">
              <SectionTitle title="面談パイプライン" />
              <StageCards />
              <CandidateTable />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SideBar() {
  // 現行ナビに合わせて重複を除去（顧客・レポート・役割・候補者は削除）。
  // 一覧＝パイプライン画面そのものなので「一覧」を active にしている。
  const items = [
    { icon: "🏠", label: "ホーム", active: false },
    { icon: "📊", label: "一覧",   active: true  },
    { icon: "👥", label: "候補者", active: false },
    { icon: "📉", label: "分析",   active: false },
    { icon: "🗂️", label: "マスタ", active: false },
    { icon: "💴", label: "コスト", active: false },
  ];
  const footer = [
    { icon: "🗑️", label: "ゴミ箱" },
    { icon: "⚙️", label: "設定" },
    { icon: "❔", label: "ヘルプ" },
  ];
  return (
    <aside className="w-20 bg-zinc-900 text-zinc-300 flex flex-col items-center py-4">
      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-white font-bold mb-6">
        面
      </div>
      <div className="flex flex-col gap-1 w-full px-2">
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            className={
              "flex flex-col items-center gap-1 py-2 rounded-lg text-2xs " +
              (it.active
                ? "bg-white/10 text-white"
                : "hover:bg-white/5 hover:text-white")
            }
          >
            <span className="text-lg leading-none">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col gap-1 w-full px-2 pb-2">
        {footer.map((it) => (
          <button
            key={it.label}
            type="button"
            className="flex flex-col items-center gap-1 py-2 rounded-lg text-2xs hover:bg-white/5 hover:text-white"
          >
            <span className="text-lg leading-none">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function TopBar() {
  return (
    <div className="h-14 px-6 border-b bg-white flex items-center gap-4">
      <span className="font-bold text-zinc-700">面談AI評価ツール</span>
      <div className="flex-1 max-w-md">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="候補者を検索…"
            className="w-full border rounded-lg pl-9 pr-3 py-1.5 text-sm bg-zinc-50 focus:bg-white"
          />
        </div>
      </div>
      <div className="flex-1" />
      <button
        type="button"
        className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded font-medium"
      >
        ＋ 新規面談
      </button>
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h1 className="font-bold text-lg tracking-wide">{title}</h1>
      <div className="flex-1" />
      <button
        type="button"
        className="border hover:bg-zinc-50 text-sm px-3 py-1 rounded"
      >
        エクスポート
      </button>
    </div>
  );
}

function StageCards() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {STAGES.map((s) => (
        <div
          key={s.key}
          className={`${s.bg} ${s.fg} rounded-xl p-4 shadow-sm relative overflow-hidden`}
        >
          <div className="text-3xl font-bold tabular">{s.count}</div>
          <div className="text-sm mt-1 opacity-90">{s.label}</div>
          <div className="absolute right-3 bottom-3 text-3xl opacity-20 leading-none">
            {s.key === "pass" ? "👍" : s.key === "fail" ? "👎" : s.key === "itv" ? "🎤" : s.key === "eval" ? "📝" : s.key === "qpub" ? "📤" : "✏️"}
          </div>
        </div>
      ))}
    </div>
  );
}

function CandidateTable() {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 text-zinc-600 text-xs">
          <tr>
            <th className="text-left px-4 py-3 font-medium">日時</th>
            <th className="text-left px-4 py-3 font-medium">氏名</th>
            <th className="text-left px-4 py-3 font-medium">役割</th>
            <th className="text-left px-4 py-3 font-medium">状態</th>
            <th className="text-right px-4 py-3 font-medium">総合スコア</th>
            <th className="text-left px-4 py-3 font-medium">合否</th>
            <th className="text-left px-4 py-3 font-medium">採否</th>
            <th className="text-right px-4 py-3 font-medium">操作</th>
          </tr>
          <tr className="border-t">
            <th className="px-4 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="絞込" /></th>
            <th className="px-4 py-2"><input className="border rounded px-2 py-1 text-xs w-full" placeholder="絞込" /></th>
            <th className="px-4 py-2">
              <select className="border rounded px-2 py-1 text-xs w-full bg-white">
                <option>すべての役割</option>
              </select>
            </th>
            <th className="px-4 py-2">
              <select className="border rounded px-2 py-1 text-xs w-full bg-white">
                <option>すべての状態</option>
              </select>
            </th>
            <th className="px-4 py-2"></th>
            <th className="px-4 py-2">
              <select className="border rounded px-2 py-1 text-xs w-full bg-white">
                <option>すべての合否</option>
              </select>
            </th>
            <th className="px-4 py-2">
              <select className="border rounded px-2 py-1 text-xs w-full bg-white">
                <option>すべての採否</option>
              </select>
            </th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ROWS.map((r) => {
            const vp = verdictPill(r.verdict);
            return (
              <tr key={r.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 text-zinc-600 tabular whitespace-nowrap">{r.datetime}</td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3">
                  <span className={`pill pill-role-${r.roleTag}`}>{r.role}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${statusPill(r.status)}`}>{r.status}</span>
                </td>
                <td className="px-4 py-3 text-right tabular font-medium">
                  {r.score == null ? (
                    <span className="text-zinc-300">―</span>
                  ) : (
                    r.score.toFixed(1)
                  )}
                </td>
                <td className="px-4 py-3">
                  {vp ? (
                    <span className={`pill ${vp}`}>{r.verdict}</span>
                  ) : (
                    <span className="text-zinc-400">―</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {r.decision === "採用" ? (
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      採用
                    </span>
                  ) : r.decision === "不採用" ? (
                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                      不採用
                    </span>
                  ) : (
                    <span className="text-zinc-400">未確定</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button className="border rounded px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 border-blue-200 mr-1">詳細</button>
                  <button className="border rounded px-3 py-1 text-xs text-red-600 hover:bg-red-50 border-red-200">削除</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-3 border-t bg-zinc-50 flex items-center text-xs text-zinc-500">
        <div>全 {ROWS.length} 件</div>
        <div className="flex-1" />
        <div className="flex gap-1">
          <button className="border rounded px-2 py-1 hover:bg-white">前へ</button>
          <button className="border rounded px-2 py-1 bg-blue-600 text-white">1</button>
          <button className="border rounded px-2 py-1 hover:bg-white">次へ</button>
        </div>
      </div>
    </div>
  );
}
