import Link from "next/link";

// 左メニュー全体の中身を刷新した案。
// 1 ページに 6 節を並べ、各メニューで違う UI パターンを提示する。
// ・ホーム: Bento グリッド
// ・一覧: タイムライン
// ・候補者: プロファイルカードグリッド
// ・分析: 分割ペイン + チャート
// ・マスタ: ツリー + 詳細分割
// ・コスト: 金融ダッシュボード（sparkline + 表）

const SECTIONS = [
  { id: "home",       label: "ホーム" },
  { id: "list",       label: "一覧" },
  { id: "candidates", label: "候補者" },
  { id: "analytics",  label: "分析" },
  { id: "master",     label: "マスタ" },
  { id: "cost",       label: "コスト" },
];

export default function Preview3Page() {
  return (
    <div className="space-y-8">
      {/* バナー + アンカーナビ */}
      <div className="bg-card rounded-2xl border shadow-sm p-4 sticky top-20 z-10">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200">
            プレビュー3
          </span>
          <span className="text-sm text-muted-foreground">左メニュー中身の全体刷新案（各節で違う UI 語彙）</span>
          <div className="flex-1" />
          <div className="flex gap-1 text-xs">
            {SECTIONS.map((s) => (
              <Link
                key={s.id}
                href={`#${s.id}`}
                className="px-2.5 py-1 rounded-full border hover:bg-accent text-foreground/85"
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <HomeSection />
      <Divider />
      <ListSection />
      <Divider />
      <CandidatesSection />
      <Divider />
      <AnalyticsSection />
      <Divider />
      <MasterSection />
      <Divider />
      <CostSection />

      <div className="text-center text-xs text-muted-foreground opacity-70 pt-6">
        <Link href="/" className="text-primary hover:underline">現行 一覧に戻る →</Link>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-zinc-200 to-transparent" />;
}

function SectionHeader({
  id,
  eyebrow,
  title,
  desc,
}: {
  id: string;
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div id={id} className="scroll-mt-32">
      <div className="text-2xs text-muted-foreground opacity-70 uppercase tracking-widest">{eyebrow}</div>
      <h2 className="text-xl font-bold text-foreground tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
    </div>
  );
}

/* ═══════════════════════════ ① ホーム — Bento ═══════════════════════════ */

function HomeSection() {
  return (
    <section className="space-y-4">
      <SectionHeader
        id="home"
        eyebrow="Menu 1 — Home"
        title="ホーム / Bento ダッシュボード"
        desc="サイズが違うタイルを組んで、今日必要な情報を一望する"
      />
      <div className="grid grid-cols-6 gap-3 auto-rows-[110px]">
        {/* 大タイル: 今週の面談 */}
        <div className="col-span-4 row-span-2 rounded-2xl border bg-gradient-to-br from-blue-500 to-violet-600 text-white p-5 shadow-sm relative overflow-hidden">
          <div className="text-xs opacity-80 uppercase tracking-widest">今週の面談</div>
          <div className="text-6xl font-bold tabular mt-1">12</div>
          <div className="text-sm mt-1 opacity-90">先週比 <span className="font-bold">+3</span></div>
          <div className="absolute right-4 bottom-4 text-6xl opacity-15">📅</div>
          <div className="absolute right-4 top-4 text-2xs bg-card/20 rounded-full px-2 py-0.5">6/30 – 7/6</div>
        </div>
        {/* 合格率 */}
        <div className="col-span-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">合格率</div>
          <div className="text-3xl font-bold text-emerald-600 tabular mt-1">64%</div>
          <div className="text-2xs text-muted-foreground opacity-70 mt-0.5">直近 30 日</div>
        </div>
        {/* 平均スコア */}
        <div className="col-span-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="text-xs text-muted-foreground">平均スコア</div>
          <div className="text-3xl font-bold tabular mt-1">71.2</div>
          <div className="text-2xs text-emerald-600 mt-0.5">▲ 4.1 pt</div>
        </div>
        {/* 未評価 (long tile) */}
        <div className="col-span-2 row-span-2 rounded-2xl border bg-amber-50 p-4 shadow-sm">
          <div className="text-xs text-amber-700 font-medium">評価待ち</div>
          <div className="text-4xl font-bold text-amber-700 tabular mt-1">5</div>
          <div className="text-2xs text-amber-600 mt-0.5">面談済 → 評価済</div>
          <ul className="mt-3 space-y-1 text-2xs text-foreground/85">
            <li>・佐藤 花子（サーバ）</li>
            <li>・中村 美咲（NW）</li>
            <li>・藤田 直人（開発）</li>
            <li>・山本 亜衣（PM）</li>
            <li className="text-muted-foreground opacity-70">... 他 1 件</li>
          </ul>
        </div>
        {/* 活動 */}
        <div className="col-span-4 row-span-2 rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center mb-3">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">最近の活動</div>
            <div className="flex-1" />
            <Link className="text-xs text-primary hover:underline" href="#">すべて表示</Link>
          </div>
          <ul className="space-y-2 text-sm">
            <ActivityItem tone="emerald" who="山田 太郎" what="評価済（82.4 / 合格）" when="1時間前" />
            <ActivityItem tone="violet"  who="佐藤 花子" what="面談実施" when="3時間前" />
            <ActivityItem tone="amber"   who="高橋 明日香" what="質問公開" when="昨日" />
            <ActivityItem tone="zinc"    who="田中 健太" what="編集開始" when="昨日" />
          </ul>
        </div>
      </div>
    </section>
  );
}

function ActivityItem({
  tone,
  who,
  what,
  when,
}: {
  tone: "emerald" | "violet" | "amber" | "zinc";
  who: string;
  what: string;
  when: string;
}) {
  const dot = {
    emerald: "bg-emerald-500",
    violet:  "bg-violet-500",
    amber:   "bg-amber-500",
    zinc:    "bg-zinc-400",
  }[tone];
  return (
    <li className="flex items-center gap-3">
      <span className={`w-2 h-2 rounded-full ${dot} shrink-0`} />
      <span className="font-medium text-foreground">{who}</span>
      <span className="text-muted-foreground">— {what}</span>
      <div className="flex-1" />
      <span className="text-2xs text-muted-foreground opacity-70">{when}</span>
    </li>
  );
}

/* ═══════════════════════════ ② 一覧 — タイムライン ═══════════════════════════ */

function ListSection() {
  const items = [
    { date: "2026-07-06", name: "田中 健太",   role: "PM",         status: "編集中",   note: "開始" },
    { date: "2026-07-05", name: "高橋 明日香", role: "サポート",   status: "質問公開", note: "質問 15 問生成" },
    { date: "2026-07-05", name: "中村 美咲",   role: "ネットワーク",status: "面談済",  note: "60 分 / 面談内容 貼付" },
    { date: "2026-07-04", name: "佐藤 花子",   role: "サーバ",     status: "面談済",   note: "45 分" },
    { date: "2026-07-02", name: "鈴木 一郎",   role: "開発",       status: "評価済",   note: "71.0 / 普通" },
    { date: "2026-06-30", name: "山田 太郎",   role: "ネットワーク",status: "評価済",  note: "82.4 / 合格 → 採用" },
  ];
  const statusTone: Record<string, string> = {
    "編集中":   "bg-muted text-foreground/85",
    "質問公開": "bg-amber-100 text-amber-800",
    "面談済":   "bg-violet-100 text-violet-800",
    "評価済":   "bg-blue-100 text-blue-800",
  };
  return (
    <section className="space-y-4">
      <SectionHeader
        id="list"
        eyebrow="Menu 2 — Sessions"
        title="一覧 / 縦タイムライン"
        desc="時系列で並び、状態変化を丸ドットで表現する"
      />
      <div className="bg-card rounded-2xl border shadow-sm p-6">
        <div className="relative ml-4">
          <div className="absolute left-0 top-2 bottom-2 w-px bg-secondary" />
          <ul className="space-y-5">
            {items.map((it, i) => (
              <li key={i} className="relative pl-6">
                <span className="absolute left-[-5px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white" />
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-xs text-muted-foreground tabular w-24 shrink-0">{it.date}</span>
                  <span className="font-medium text-foreground">{it.name}</span>
                  <span className="text-xs text-muted-foreground">/ {it.role}</span>
                  <span className={`text-2xs px-2 py-0.5 rounded-full font-medium ${statusTone[it.status]}`}>
                    {it.status}
                  </span>
                  <span className="text-xs text-muted-foreground">— {it.note}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════ ③ 候補者 — プロファイルカード ═══════════════════════════ */

function CandidatesSection() {
  const people = [
    { name: "山田 太郎",   role: "ネットワーク", roleTag: "nw",  sessions: 2, last: "2026-06-30", best: 82.4, verdict: "合格" as const },
    { name: "佐藤 花子",   role: "サーバ",       roleTag: "sv",  sessions: 1, last: "2026-07-04", best: null,  verdict: null },
    { name: "鈴木 一郎",   role: "開発",         roleTag: "dev", sessions: 3, last: "2026-07-02", best: 71.0, verdict: "普通" as const },
    { name: "高橋 明日香", role: "サポート",     roleTag: "sp",  sessions: 1, last: "2026-07-05", best: null,  verdict: null },
    { name: "伊藤 詩織",   role: "情シス",       roleTag: "it",  sessions: 2, last: "2026-06-28", best: 76.2, verdict: "合格" as const },
    { name: "渡辺 拓也",   role: "開発",         roleTag: "dev", sessions: 1, last: "2026-06-25", best: 48.5, verdict: "不合格" as const },
  ];
  const initial = (n: string) => n.trim().charAt(0);
  const bg = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-cyan-500"];
  return (
    <section className="space-y-4">
      <SectionHeader
        id="candidates"
        eyebrow="Menu 3 — Candidates"
        title="候補者 / プロファイルカード"
        desc="同名候補者の複数セッションを 1 カードに束ねる（ディレクトリ的な見せ方）"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {people.map((p, i) => (
          <div key={p.name} className="bg-card rounded-2xl border shadow-sm p-4 hover:shadow-md transition">
            <div className="flex items-start gap-3">
              <div className={`w-12 h-12 rounded-full ${bg[i % bg.length]} text-white font-bold flex items-center justify-center text-lg shrink-0`}>
                {initial(p.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground">{p.name}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <span className={`pill pill-role-${p.roleTag}`}>{p.role}</span>
                  <span className="text-2xs text-muted-foreground">・面談 {p.sessions} 件</span>
                </div>
              </div>
              {p.verdict && (
                <span className={
                  "text-2xs px-2 py-0.5 rounded-full font-medium shrink-0 " +
                  (p.verdict === "合格" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                   p.verdict === "普通" ? "bg-amber-50 text-amber-700 border border-amber-200" :
                                          "bg-rose-50 text-rose-700 border border-rose-200")
                }>
                  {p.verdict}
                </span>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-muted py-2">
                <div className="text-2xs text-muted-foreground">最新面談</div>
                <div className="text-xs font-medium tabular text-foreground mt-0.5">{p.last}</div>
              </div>
              <div className="rounded-lg bg-muted py-2">
                <div className="text-2xs text-muted-foreground">ベストスコア</div>
                <div className={
                  "text-xs font-medium tabular mt-0.5 " +
                  (p.best == null ? "text-muted-foreground opacity-70" : "text-foreground")
                }>
                  {p.best?.toFixed(1) ?? "―"}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════ ④ 分析 — 分割ペイン ═══════════════════════════ */

function AnalyticsSection() {
  const distribution = [
    { label: "40-49", h: 12, count: 3, tone: "bg-rose-400" },
    { label: "50-59", h: 24, count: 5, tone: "bg-rose-300" },
    { label: "60-69", h: 40, count: 8, tone: "bg-amber-300" },
    { label: "70-79", h: 60, count: 12, tone: "bg-amber-400" },
    { label: "80-89", h: 45, count: 9, tone: "bg-emerald-400" },
    { label: "90-100", h: 15, count: 3, tone: "bg-emerald-500" },
  ];
  const axes = [
    { name: "自己解決", pass: 3.9, fail: 2.4 },
    { name: "技術理解", pass: 4.2, fail: 2.1 },
    { name: "コミュ",   pass: 3.8, fail: 3.0 },
    { name: "業務経験", pass: 4.0, fail: 2.8 },
    { name: "適応力",   pass: 3.6, fail: 2.9 },
  ];
  return (
    <section className="space-y-4">
      <SectionHeader
        id="analytics"
        eyebrow="Menu 4 — Analytics"
        title="分析 / 分割ペイン + チャート"
        desc="左側に条件を選び、右側に複数チャートを積む。ドリルダウン前提"
      />
      <div className="grid grid-cols-4 gap-4">
        {/* 左: 条件 */}
        <div className="col-span-1 space-y-3">
          <FilterGroup title="期間">
            {["今週", "今月", "直近 3 ヶ月", "全期間"].map((v, i) => (
              <RadioRow key={v} label={v} checked={i === 1} />
            ))}
          </FilterGroup>
          <FilterGroup title="役割">
            {["ネットワーク", "サーバ", "開発", "PM", "情シス"].map((v, i) => (
              <CheckRow key={v} label={v} checked={i < 3} />
            ))}
          </FilterGroup>
          <FilterGroup title="合否">
            {["合格", "普通", "不合格"].map((v) => (
              <CheckRow key={v} label={v} checked />
            ))}
          </FilterGroup>
        </div>
        {/* 右: チャート */}
        <div className="col-span-3 grid grid-cols-2 gap-3">
          <div className="col-span-2 bg-card rounded-2xl border shadow-sm p-4">
            <div className="flex items-center mb-3">
              <div className="font-semibold text-sm text-foreground">スコア分布</div>
              <span className="ml-2 text-2xs text-muted-foreground opacity-70">n = 40</span>
              <div className="flex-1" />
              <div className="text-2xs text-muted-foreground">合格ライン 70 / 普通 60</div>
            </div>
            <div className="flex items-end gap-2 h-32">
              {distribution.map((d) => (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-2xs text-muted-foreground tabular">{d.count}</div>
                  <div
                    className={`${d.tone} w-full rounded-t-md`}
                    style={{ height: `${d.h * 1.5}px` }}
                  />
                  <div className="text-2xs text-muted-foreground tabular">{d.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-card rounded-2xl border shadow-sm p-4">
            <div className="font-semibold text-sm text-foreground mb-3">合格 vs 不合格 の軸別平均</div>
            <ul className="space-y-2">
              {axes.map((a) => (
                <li key={a.name} className="text-xs">
                  <div className="flex justify-between text-muted-foreground mb-1">
                    <span>{a.name}</span>
                    <span className="tabular">
                      <span className="text-emerald-600">{a.pass.toFixed(1)}</span>
                      <span className="text-muted-foreground opacity-50 mx-1">/</span>
                      <span className="text-rose-500">{a.fail.toFixed(1)}</span>
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-muted overflow-hidden">
                    <div className="absolute inset-y-0 left-0 bg-emerald-400" style={{ width: `${(a.pass / 5) * 100}%` }} />
                    <div className="absolute inset-y-0 left-0 bg-rose-400/60 mix-blend-multiply" style={{ width: `${(a.fail / 5) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-card rounded-2xl border shadow-sm p-4">
            <div className="font-semibold text-sm text-foreground mb-3">役割別 合格率</div>
            <ul className="space-y-2 text-xs">
              {[
                { name: "ネットワーク", rate: 71, n: 7 },
                { name: "開発",         rate: 58, n: 12 },
                { name: "サーバ",       rate: 63, n: 8 },
                { name: "PM",           rate: 80, n: 5 },
                { name: "情シス",       rate: 50, n: 4 },
              ].map((r) => (
                <li key={r.name}>
                  <div className="flex justify-between text-muted-foreground mb-0.5">
                    <span>{r.name} <span className="text-muted-foreground opacity-70">({r.n})</span></span>
                    <span className="tabular font-medium">{r.rate}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-400 to-emerald-400" style={{ width: `${r.rate}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border shadow-sm p-3">
      <div className="text-2xs text-muted-foreground uppercase tracking-widest mb-2 px-1">{title}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}
function RadioRow({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <li className={"flex items-center gap-2 px-2 py-1 rounded text-xs " + (checked ? "bg-blue-50 text-blue-700 font-medium" : "text-muted-foreground hover:bg-accent")}>
      <span className={"w-3 h-3 rounded-full border " + (checked ? "border-blue-500 bg-blue-500 ring-2 ring-blue-100" : "border-border")} />
      {label}
    </li>
  );
}
function CheckRow({ label, checked }: { label: string; checked?: boolean }) {
  return (
    <li className={"flex items-center gap-2 px-2 py-1 rounded text-xs " + (checked ? "text-foreground font-medium" : "text-muted-foreground hover:bg-accent")}>
      <span className={"w-3 h-3 rounded-sm border flex items-center justify-center text-white " + (checked ? "border-emerald-500 bg-emerald-500" : "border-border")}>
        {checked && <span className="text-[8px] leading-none">✓</span>}
      </span>
      {label}
    </li>
  );
}

/* ═══════════════════════════ ⑤ マスタ — ツリー + 詳細 ═══════════════════════════ */

function MasterSection() {
  const roles = [
    { id: "NW", name: "ネットワーク",   count: 12, active: true },
    { id: "Server", name: "サーバ",     count: 8 },
    { id: "Dev", name: "開発",           count: 15 },
    { id: "Special", name: "スペシャル", count: 3 },
    { id: "PMO", name: "PM",             count: 5 },
    { id: "ITSupport", name: "情シス",    count: 4 },
  ];
  const criteria = [
    { name: "自己解決レベル",   weight: 5 },
    { name: "技術理解",         weight: 5 },
    { name: "コミュニケーション", weight: 3 },
    { name: "業務経験",         weight: 4 },
    { name: "適応力・柔軟性",   weight: 3 },
  ];
  return (
    <section className="space-y-4">
      <SectionHeader
        id="master"
        eyebrow="Menu 5 — Master Data"
        title="マスタ / ツリー + 詳細分割"
        desc="左に役割一覧、右に選択中の詳細（評価軸・重み・条件）"
      />
      <div className="grid grid-cols-4 gap-4 min-h-[420px]">
        <div className="col-span-1 bg-card rounded-2xl border shadow-sm p-3">
          <div className="flex items-center px-2 mb-2">
            <div className="text-2xs text-muted-foreground uppercase tracking-widest">役割</div>
            <div className="flex-1" />
            <button className="text-blue-600 text-lg leading-none">＋</button>
          </div>
          <ul className="space-y-0.5">
            {roles.map((r) => (
              <li
                key={r.id}
                className={
                  "flex items-center gap-2 px-2 py-2 rounded-lg text-sm cursor-pointer " +
                  (r.active
                    ? "bg-blue-50 text-blue-800 font-medium"
                    : "text-foreground/85 hover:bg-accent")
                }
              >
                <span className={`pill pill-role-${r.id === "NW" ? "nw" : r.id === "Server" ? "sv" : r.id === "Dev" ? "dev" : r.id === "Special" ? "sp" : r.id === "PMO" ? "pm" : "it"}`}>
                  {r.id}
                </span>
                <span className="flex-1 truncate">{r.name}</span>
                <span className="text-2xs text-muted-foreground opacity-70 tabular">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-3 bg-card rounded-2xl border shadow-sm p-5 space-y-5">
          <div className="flex items-center gap-3">
            <span className="pill pill-role-nw">NW</span>
            <h3 className="text-lg font-bold text-foreground">ネットワーク</h3>
            <div className="flex-1" />
            <button className="border rounded-lg px-3 py-1 text-xs hover:bg-accent">複製</button>
            <button className="border rounded-lg px-3 py-1 text-xs hover:bg-accent">ロック</button>
            <button className="bg-blue-600 text-white rounded-lg px-3 py-1 text-xs">保存</button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <FormField label="経験" value="3 年以上" />
            <FormField label="未経験可" value="いいえ" />
            <FormField label="合格ライン" value="70" />
          </div>
          <div>
            <div className="text-2xs text-muted-foreground uppercase tracking-widest mb-2">評価軸 / 重み</div>
            <ul className="space-y-2">
              {criteria.map((c) => (
                <li key={c.name} className="flex items-center gap-3 border rounded-xl p-3 hover:bg-accent">
                  <span className="text-muted-foreground opacity-70 cursor-move">⋮⋮</span>
                  <span className="text-sm text-foreground flex-1">{c.name}</span>
                  <div className="flex gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={
                          "w-6 h-6 rounded-md flex items-center justify-center text-xs " +
                          (i < c.weight
                            ? "bg-blue-500 text-white"
                            : "bg-muted text-muted-foreground opacity-70")
                        }
                      >
                        {i + 1}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function FormField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xs text-muted-foreground uppercase tracking-widest mb-1">{label}</div>
      <div className="border rounded-lg px-3 py-2 text-sm bg-muted">{value}</div>
    </div>
  );
}

/* ═══════════════════════════ ⑥ コスト — 金融ダッシュボード ═══════════════════════════ */

function CostSection() {
  const providers = [
    { name: "anthropic",  usd: 12.4,  count: 32, spark: [3, 5, 4, 7, 6, 8, 9, 6, 7, 10] },
    { name: "openai",     usd: 8.7,   count: 24, spark: [2, 3, 4, 3, 5, 4, 6, 7, 5, 6] },
    { name: "google",     usd: 3.1,   count: 15, spark: [1, 2, 2, 3, 2, 3, 3, 4, 3, 3] },
  ];
  const stages = [
    { name: "② 要約",     usd: 5.2, share: 22 },
    { name: "⑤ 質問生成", usd: 8.4, share: 35 },
    { name: "⑥ 面談内容要約", usd: 3.1, share: 13 },
    { name: "⑧ 評価",     usd: 7.5, share: 30 },
  ];
  return (
    <section className="space-y-4">
      <SectionHeader
        id="cost"
        eyebrow="Menu 6 — Cost"
        title="コスト / 金融ダッシュボード"
        desc="金額・件数・傾向を横一列に、内訳を下に積む"
      />
      <div className="grid grid-cols-4 gap-3">
        <BigStat label="今月合計" value="¥24,200" delta="+12%" tone="down" />
        <BigStat label="1回あたり平均" value="¥340" delta="−3%" tone="up" />
        <BigStat label="呼出回数" value="71" delta="+8" tone="neutral" />
        <BigStat label="想定月末" value="¥31,500" delta="予算内" tone="up" />
      </div>
      <div className="grid grid-cols-5 gap-3">
        <div className="col-span-3 bg-card rounded-2xl border shadow-sm p-4">
          <div className="text-sm font-semibold text-foreground mb-3">プロバイダ別</div>
          <table className="w-full text-sm">
            <thead className="text-2xs text-muted-foreground uppercase tracking-widest">
              <tr>
                <th className="text-left pb-2">Provider</th>
                <th className="text-right pb-2">回数</th>
                <th className="text-right pb-2">合計</th>
                <th className="text-right pb-2 w-32">10 日推移</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {providers.map((p) => (
                <tr key={p.name}>
                  <td className="py-2 font-mono text-xs">{p.name}</td>
                  <td className="py-2 text-right tabular">{p.count}</td>
                  <td className="py-2 text-right tabular font-medium">${p.usd.toFixed(2)}</td>
                  <td className="py-2 text-right">
                    <Sparkline values={p.spark} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="col-span-2 bg-card rounded-2xl border shadow-sm p-4">
          <div className="text-sm font-semibold text-foreground mb-3">工程別内訳</div>
          <ul className="space-y-3">
            {stages.map((s) => (
              <li key={s.name}>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>{s.name}</span>
                  <span className="tabular">${s.usd.toFixed(1)} ・ {s.share}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-500 to-blue-500" style={{ width: `${s.share}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function BigStat({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "up" | "down" | "neutral";
}) {
  const deltaCls =
    tone === "up" ? "text-emerald-600 bg-emerald-50" :
    tone === "down" ? "text-rose-600 bg-rose-50" :
    "text-muted-foreground bg-muted";
  return (
    <div className="bg-card rounded-2xl border shadow-sm p-4">
      <div className="text-2xs text-muted-foreground uppercase tracking-widest">{label}</div>
      <div className="text-2xl font-bold text-foreground tabular mt-1">{value}</div>
      <span className={`inline-block mt-2 text-2xs font-medium px-2 py-0.5 rounded ${deltaCls}`}>
        {delta}
      </span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const w = 100, h = 24;
  const step = w / (values.length - 1);
  const pts = values
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="inline-block w-24 h-6">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={pts}
        className="text-blue-500"
      />
    </svg>
  );
}
