import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// 現行 5 節（Section2/4/5/6/8）の「実際の内容」を忠実に再現し、
// ステッパー UI で 1 節ずつ表示するプレビュー。
// - 節ヘッダバー / モード切替 / MaxPromptCopy or API 生成エリア / 保存インジケータ
//   まで実装に近い形で再現
// - ダミーデータ、nav 非表示
type StepKey = "s2" | "s4" | "s5" | "s6" | "s8";
type Mode = "paste" | "api";
type SP = Promise<{ section?: StepKey; mode?: Mode }>;

const STEPS: {
  key: StepKey;
  no: string;
  label: string;
  status: "done" | "current" | "todo";
  meta: string;
}[] = [
  { key: "s2", no: "①", label: "面談者情報",     status: "done",    meta: "要約済 09:12" },
  { key: "s4", no: "②", label: "求める人材条件", status: "done",    meta: "凍結 09:15 🔒" },
  { key: "s5", no: "③", label: "質問リスト",     status: "current", meta: "非技術 7 + 技術 8" },
  { key: "s6", no: "④", label: "面談内容",         status: "todo",    meta: "未着手" },
  { key: "s8", no: "⑤", label: "評価・合否判定", status: "todo",    meta: "未着手" },
];

export default async function Page({ searchParams }: { searchParams: SP }) {
  const { section = "s2", mode = "paste" } = await searchParams;
  const idx = STEPS.findIndex((s) => s.key === section);
  const current = STEPS[idx] ?? STEPS[0];
  const prev = idx > 0 ? STEPS[idx - 1] : null;
  const next = idx < STEPS.length - 1 ? STEPS[idx + 1] : null;

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl border shadow-sm p-3 flex items-center gap-3 text-xs flex-wrap">
        <span className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 font-medium">
          プレビュー（忠実版）
        </span>
        <span className="text-muted-foreground">現行 5 節を stepper に分割。内容は現状ママ</span>
        <div className="flex-1" />
        <span className="text-muted-foreground">Mode:</span>
        <Link
          href={`/preview-stepper-full?section=${section}&mode=paste`}
          className={
            "px-2 py-0.5 rounded " +
            (mode === "paste"
              ? "bg-zinc-800 text-white"
              : "border hover:bg-accent text-foreground/85")
          }
        >
          貼付
        </Link>
        <Link
          href={`/preview-stepper-full?section=${section}&mode=api`}
          className={
            "px-2 py-0.5 rounded " +
            (mode === "api"
              ? "bg-emerald-600 text-white"
              : "border hover:bg-accent text-foreground/85")
          }
        >
          API
        </Link>
      </div>

      <div className="bg-card rounded-xl border shadow-sm">
        {/* 実 SessionPage と同じヘッダ */}
        <header className="px-4 py-2.5 border-b flex items-center gap-3 text-sm">
          <Link
            href="/"
            className="h-8 pl-2 pr-3 gap-1.5 rounded-full text-xs font-medium text-muted-foreground hover:text-blue-600 hover:bg-blue-50 flex items-center"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            一覧
          </Link>
          <div className="h-5 w-px bg-secondary" />
          <h1 className="font-bold text-sm">山田 太郎</h1>
          <span className="pill pill-role-nw">ネットワーク</span>
          <span className="pill pill-qpub">質問公開</span>
          <div className="flex-1" />
          <button className="text-xs text-muted-foreground hover:text-blue-600 px-2 py-1 rounded hover:bg-accent">
            ⏸ 保留
          </button>
          <select className="text-xs border rounded px-2 py-1 bg-card">
            <option>採否: 未確定</option>
          </select>
          <span className="text-xs text-muted-foreground opacity-70 whitespace-nowrap">
            作成: 2026-06-30 09:00:12
          </span>
        </header>

        <div className="grid grid-cols-4 min-h-[780px]">
          <Stepper section={section} mode={mode} />
          <main className="col-span-3 p-6 space-y-4">
            <Section key={current.key} step={current} mode={mode} />
            <div className="flex items-center gap-2 pt-4 border-t">
              {prev ? (
                <Link
                  href={`/preview-stepper-full?section=${prev.key}&mode=${mode}`}
                  className="border rounded-lg px-4 py-2 text-sm hover:bg-accent"
                >
                  ← {prev.no} {prev.label}
                </Link>
              ) : (
                <span />
              )}
              <div className="flex-1" />
              {next ? (
                <Link
                  href={`/preview-stepper-full?section=${next.key}&mode=${mode}`}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
                >
                  {next.no} {next.label} →
                </Link>
              ) : (
                <button className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
                  評価を確定
                </button>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function Stepper({ section, mode }: { section: StepKey; mode: Mode }) {
  return (
    <aside className="col-span-1 border-r p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
        進捗 {STEPS.filter((s) => s.status === "done").length + 1} / {STEPS.length}
      </div>
      <ol className="space-y-1">
        {STEPS.map((s, i) => {
          const isCurrent = s.key === section;
          const isDone = s.status === "done";
          const nextDone = STEPS[i + 1]?.status === "done";
          return (
            <li key={s.key} className="relative pb-2">
              {i < STEPS.length - 1 && (
                <div
                  className={
                    "absolute left-4 top-8 h-full w-0.5 " +
                    (isDone && nextDone ? "bg-emerald-500" : "bg-secondary")
                  }
                />
              )}
              {isCurrent ? (
                <div className="bg-blue-50 -mx-2 px-4 py-2 rounded-lg border-2 border-blue-300 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold shrink-0 ring-4 ring-blue-100 relative z-10">
                      ◉
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="text-sm font-semibold text-blue-800">
                        {s.no} {s.label}
                      </div>
                      <div className="text-2xs text-blue-600">{s.meta}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <Link
                  href={`/preview-stepper-full?section=${s.key}&mode=${mode}`}
                  className="w-full flex items-start gap-3 px-2 py-2 rounded-lg hover:bg-accent text-left"
                >
                  <div
                    className={
                      "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 relative z-10 " +
                      (s.status === "done"
                        ? "bg-emerald-500 text-white"
                        : "bg-card border-2 border-border text-muted-foreground opacity-70")
                    }
                  >
                    {s.status === "done" ? "✓" : i + 1}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <div
                      className={
                        "text-sm " +
                        (s.status === "done" ? "font-medium text-foreground" : "text-muted-foreground")
                      }
                    >
                      {s.no} {s.label}
                    </div>
                    <div className="text-2xs text-muted-foreground opacity-70">{s.meta}</div>
                  </div>
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/* ═══════════════════════════ SECTION HEADER BAR (現行 SectionHeaderBar.tsx) ══════ */
function HeaderBar({
  title,
  hasData,
  mode,
  apiLabel,
  onlyPaste,
  onlyApi,
}: {
  title: string;
  hasData: boolean;
  mode: Mode;
  apiLabel?: string;
  onlyPaste?: boolean;
  onlyApi?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap pb-3 border-b mb-4">
      <h2 className="text-lg font-bold">{title}</h2>
      {hasData && (
        <span className="text-xs text-emerald-600">✓ 保存済</span>
      )}
      <div className="flex-1" />
      {!onlyPaste && !onlyApi && (
        <>
          <div className="flex rounded-lg border bg-card overflow-hidden text-xs">
            <span
              className={
                "px-3 py-1.5 " +
                (mode === "paste"
                  ? "bg-blue-600 text-white font-medium"
                  : "text-muted-foreground")
              }
            >
              貼付
            </span>
            <span
              className={
                "px-3 py-1.5 " +
                (mode === "api"
                  ? "bg-emerald-600 text-white font-medium"
                  : "text-muted-foreground")
              }
            >
              {apiLabel ?? "API"}
            </span>
          </div>
          {mode === "api" && (
            <div className="flex items-center gap-1.5 text-xs">
              <select className="border rounded px-2 py-1 bg-card text-xs">
                <option>anthropic</option>
              </select>
              <select className="border rounded px-2 py-1 bg-card text-xs">
                <option>claude-sonnet-4-6</option>
              </select>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════ MaxPromptCopy 相当 ══════ */
function MaxPromptCopy({ hint }: { hint: string }) {
  return (
    <div className="border rounded-lg p-3 bg-blue-50/50 border-blue-200 space-y-2 mb-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-blue-700">📋 Max チャット用プロンプト</span>
        <button className="text-xs border rounded px-2 py-0.5 bg-card hover:bg-blue-50">
          コピー
        </button>
      </div>
      <p className="text-2xs text-muted-foreground leading-relaxed">{hint}</p>
    </div>
  );
}

/* ═══════════════════════════ SECTION ROUTER ══════ */
function Section({ step, mode }: { step: (typeof STEPS)[number]; mode: Mode }) {
  if (step.key === "s2") return <SectionS2 mode={mode} />;
  if (step.key === "s4") return <SectionS4 />;
  if (step.key === "s5") return <SectionS5 mode={mode} />;
  if (step.key === "s6") return <SectionS6 />;
  return <SectionS8 mode={mode} />;
}

/* ═══════════════════════════ ① 面談者情報 (Section2Candidate) ══════ */
function SectionS2({ mode }: { mode: Mode }) {
  return (
    <>
      <HeaderBar title="① 面談者情報" hasData mode={mode} apiLabel="API自動要約" />

      {mode === "api" && (
        <div className="border rounded-lg p-3 mb-3 bg-muted space-y-3">
          <div className="text-xs text-muted-foreground">
            履歴書（<strong>PDF / Word(.doc / .docx) / Excel(.xlsx / .xls)</strong>）をアップロードするか、
            テキストを貼り付けて「要約する（API）」を押すと AI が経歴・スキル・強み・懸念点で要約します。
            <br />
            <span className="text-muted-foreground">
              ※ ファイルはサーバー側でテキスト抽出してから送信します（PDF の生バイナリは送りません）。
            </span>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              履歴書ファイル（任意）
            </div>
            <div className="flex items-center gap-2">
              <button className="border rounded-lg px-3 py-1.5 text-xs hover:bg-card bg-card">
                📎 履歴書をアップ
              </button>
              <span className="text-xs text-foreground/85">
                📄 yamada_taro_cv.pdf <span className="pill pill-eval ml-1">PDF</span>
                <span className="text-muted-foreground opacity-70 ml-1">(12.4 KB)</span>
              </span>
              <button className="text-xs text-red-600 hover:bg-red-50 px-2 py-0.5 rounded">
                取消
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">
              貼付テキスト（ファイルが無いとき、または併用しない場合の代替）
            </div>
            <textarea
              rows={4}
              className="w-full border rounded-lg text-sm bg-card p-2"
              placeholder="履歴書テキストを貼り付け（ファイルを選んだ場合は無視されます）"
              disabled
            />
          </div>
          <div className="flex items-center gap-3">
            <button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium">
              要約する（API）
            </button>
            <span className="text-xs text-muted-foreground">
              ※ 要約結果は下のテキスト欄に反映され、自動保存されます。
            </span>
          </div>
        </div>
      )}

      {mode === "paste" && (
        <MaxPromptCopy hint="Max チャットで履歴書要約する場合：プロンプトをコピー → Max に貼付＋履歴書ファイル添付 → 結果を下のテキスト欄にペースト → 保存。" />
      )}

      <div className="text-xs text-muted-foreground mb-1">要約</div>
      <div className="relative">
        <textarea
          rows={14}
          className="w-full text-sm leading-relaxed border rounded-lg p-3 pb-6"
          defaultValue={`【経歴】
10 年、SIer → 社内 SE
前職の大規模社内 NW 刷新プロジェクトで要件定義から検証まで自走

【主要スキル】
Cisco / Palo Alto / AWS Direct Connect / TransitGateway / Zabbix

【強み】
・大規模障害対応の実務経験
・仮説→実機検証を回せる思考プロセス
・顧客との折衝経験

【懸念点】
・PM 経験は少なめ
・海外拠点対応は未経験`}
        />
        <span className="absolute bottom-2 right-2 text-2xs text-emerald-600 bg-card px-1.5 rounded">
          ✓ 保存済
        </span>
      </div>
      <div className="text-xs text-muted-foreground opacity-70 mt-2">
        最終保存: 2026/6/30 09:12:34
      </div>
    </>
  );
}

/* ═══════════════════════════ ② 求める人材条件 (Section4Conditions) ══════ */
function SectionS4() {
  return (
    <>
      <HeaderBar title="② 求める人材条件" hasData mode="paste" onlyPaste />
      <div className="text-xs text-muted-foreground bg-blue-50/50 border border-blue-200 rounded-lg p-3 mb-3">
        🔒 <strong>凍結済</strong>（2026-06-30 09:15）— このセッションの評価軸・合格ラインは以下で固定されます。マスタが変更されてもここは変わりません。
      </div>

      <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
        <div className="flex items-center gap-3">
          <span className="pill pill-role-nw">NW</span>
          <h3 className="font-semibold text-base">ネットワーク</h3>
          <div className="flex-1" />
          <button className="text-xs text-muted-foreground border rounded px-3 py-1 bg-card">
            修正して再凍結
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground">経験</div>
            <div className="font-medium mt-0.5">3 年以上</div>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground">未経験可</div>
            <div className="font-medium mt-0.5">いいえ</div>
          </div>
          <div className="border rounded-lg p-3 bg-card">
            <div className="text-xs text-muted-foreground">合格ライン</div>
            <div className="font-medium mt-0.5 tabular">70 / 100</div>
          </div>
        </div>

        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
            条件1 基本人物像
          </div>
          <ul className="text-sm space-y-1">
            <li className="flex gap-2">
              <span className="text-emerald-500">✓</span>
              手順書が無くても仮説を立てて動ける
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">✓</span>
              障害対応を落ち着いて回せる
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">✓</span>
              顧客・関係者との折衝経験がある
            </li>
          </ul>
        </div>

        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
            評価軸 / 重み（1-5）
          </div>
          <ul className="space-y-2 text-sm">
            {[
              ["自己解決", 5],
              ["技術理解", 5],
              ["コミュニケーション", 3],
              ["業務経験", 4],
              ["適応力・柔軟性", 3],
            ].map(([name, weight]) => (
              <li
                key={name as string}
                className="flex items-center gap-3 border rounded-lg p-2.5 bg-card"
              >
                <span className="flex-1">{name}</span>
                <div className="flex gap-1">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span
                      key={i}
                      className={
                        "w-5 h-5 rounded flex items-center justify-center text-2xs font-medium " +
                        (i < (weight as number)
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
    </>
  );
}

/* ═══════════════════════════ ③ 質問リスト (Section5Questions) ══════ */
function SectionS5({ mode }: { mode: Mode }) {
  return (
    <>
      <HeaderBar title="③ 質問リスト" hasData mode={mode} apiLabel="API生成" />

      {mode === "api" && (
        <div className="border rounded p-3 mb-2 bg-muted flex items-center gap-3 text-sm">
          <div className="flex-1 text-muted-foreground">
            ① 面談者情報 + ② 凍結条件を入力に、AI で「非技術 <b>7</b> 問 + 技術 <b>8</b> 問」を section 付きで生成します。
          </div>
          <button className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm">
            質問を生成
          </button>
        </div>
      )}
      {mode === "paste" && (
        <MaxPromptCopy hint="Max チャットで生成する場合：プロンプトをコピー → Max に貼付 → 出力（## 非技術 / ## 技術 の section 付き）を下にペースト → 保存。" />
      )}

      {/* カウンター */}
      <div className="flex items-center gap-2 text-xs mb-2 flex-wrap">
        <span className="px-2 py-1 rounded font-medium bg-emerald-100 text-emerald-800">
          非技術 7/7 ✓
        </span>
        <span className="px-2 py-1 rounded font-medium bg-blue-100 text-blue-800">
          技術 8/8 ✓
        </span>
        <span className="text-muted-foreground">合計 15 問</span>
      </div>

      {/* 非技術 */}
      <div className="border rounded-lg p-3 mb-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2">非技術 7 問</div>
        <textarea
          rows={9}
          className="w-full text-sm leading-relaxed border rounded p-2 bg-muted font-mono"
          defaultValue={`⭐ Q1: 職務経歴の中で、最も自走的に動けた案件を教えてください。
⭐ Q2: 障害対応で「これは自分の判断で動いた」と誇れる例を教えてください。
Q3: チームでのコミュニケーションで意識していることは？
Q4: 顧客との折衝で苦労した経験を教えてください。
Q5: 新しい技術を学ぶきっかけは？
Q6: 志望動機を教えてください。
Q7: 3 年後にどうなっていたいですか？`}
        />
      </div>

      {/* 技術 */}
      <div className="border rounded-lg p-3">
        <div className="text-xs font-semibold text-muted-foreground mb-2">技術 8 問</div>
        <textarea
          rows={10}
          className="w-full text-sm leading-relaxed border rounded p-2 bg-muted font-mono"
          defaultValue={`⭐ T1: Cisco と Palo Alto を選ぶ場面と理由を教えてください。
⭐ T2: AWS Direct Connect 構築時にハマった点は？
T3: BGP のフラップ対策として何を検討しますか？
T4: TransitGateway で数百 VPC を束ねる時の注意点は？
T5: Zabbix と CloudWatch を組み合わせる理由と例は？
T6: L2/L3 冗長化の設計方針は？
T7: 監視の粒度をどう決めますか？
T8: 障害復旧の RTO/RPO をどう合意しますか？`}
        />
      </div>

      <div className="text-xs text-muted-foreground opacity-70 mt-3">
        最終保存: 2026/6/30 09:22:41
      </div>
    </>
  );
}

/* ═══════════════════════════ ④ 面談内容 (Section6Minutes) ══════ */
function SectionS6() {
  return (
    <>
      <HeaderBar title="④ 面談内容" hasData={false} mode="paste" onlyPaste />
      <div className="text-xs text-muted-foreground bg-amber-50/50 border border-amber-200 rounded-lg p-3 mb-3">
        面談中の記録をここに貼付／記入します。保存すると ⑤ 評価の入力になります。
      </div>
      <textarea
        rows={20}
        className="w-full text-sm leading-relaxed border rounded-lg p-3"
        placeholder="ここに面談内容を貼付、または直接入力"
        defaultValue=""
      />
      <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
        <span>0 字</span>
        <span>・</span>
        <span>未保存</span>
        <div className="flex-1" />
        <button className="border rounded px-3 py-1 text-xs">クリア</button>
        <button className="bg-blue-600 text-white rounded px-3 py-1 text-xs font-medium">
          保存
        </button>
      </div>
    </>
  );
}

/* ═══════════════════════════ ⑤ 評価・合否判定 (Section8Evaluation) ══════ */
function SectionS8({ mode }: { mode: Mode }) {
  return (
    <>
      <HeaderBar title="⑤ 評価・合否判定" hasData={false} mode={mode} apiLabel="API評価" />

      {mode === "api" && (
        <div className="border rounded-lg p-3 mb-3 bg-muted space-y-3">
          <div className="text-xs text-muted-foreground">
            ② 凍結条件 + ④ 面談内容を入力に、AI が BARS で採点します。厳格モードでより高性能なモデルを使用。
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
              評価する（API）
            </button>
            <label className="flex items-center gap-2 text-sm text-foreground/85">
              <span className="inline-block w-9 h-5 bg-blue-500 rounded-full relative">
                <span className="absolute right-0.5 top-0.5 w-4 h-4 bg-card rounded-full shadow" />
              </span>
              厳格モード（Opus 4.7）
            </label>
            <span className="text-xs text-muted-foreground">※ 結果は自動保存されます。</span>
          </div>
        </div>
      )}
      {mode === "paste" && (
        <MaxPromptCopy hint="Max チャットで評価する場合：プロンプトをコピー → Max に貼付 → 出力（JSON）を下のフォームに反映。" />
      )}

      {/* 評価入力フォーム（各軸のスコア + 根拠、良い点/懸念点、合否） */}
      <div className="space-y-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-widest mb-2">
            軸別スコア（0.0 - 5.0）
          </div>
          <ul className="space-y-3">
            {[
              ["自己解決", 4.2, "手順書が無い場面でも自分で仮説を立てて検証まで持っていった具体例が複数。"],
              ["技術理解", 4.5, "L2/L3 冗長化、BGP、TransitGateway まで一貫して答えられる。"],
              ["コミュ", 3.8, "説明は明快。ただし相手が非技術者の時の言い換えはやや弱い。"],
              ["業務経験", 4.0, "大規模刷新の経験が豊富。海外拠点対応は未経験。"],
            ].map(([name, score, reason]) => (
              <li key={name as string} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm w-24">{name}</span>
                  <input
                    type="number"
                    step="0.1"
                    defaultValue={score as number}
                    className="border rounded px-2 py-1 w-20 text-sm tabular text-right"
                  />
                  <span className="text-xs text-muted-foreground opacity-70">/ 5.0</span>
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${((score as number) / 5) * 100}%` }}
                    />
                  </div>
                </div>
                <textarea
                  rows={2}
                  defaultValue={reason as string}
                  className="w-full border rounded p-2 text-xs bg-muted"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
              良い点
            </div>
            <textarea
              rows={3}
              className="w-full border rounded-lg p-2 text-sm bg-emerald-50/40"
              defaultValue="運用経験が豊富、障害対応の具体例が明確。仮説→検証プロセスも自走できる。"
            />
          </div>
          <div>
            <div className="text-xs text-muted-foreground uppercase tracking-widest mb-1">
              懸念点
            </div>
            <textarea
              rows={3}
              className="w-full border rounded-lg p-2 text-sm bg-amber-50/40"
              defaultValue="大規模プロジェクト経験がやや少ない。マネジメント側は今後の育成対象。"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">総合スコア</div>
            <div className="text-3xl font-bold tabular mt-1 text-emerald-600">82.4</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">合否 (自動)</div>
            <select className="mt-1 border rounded px-2 py-1 text-sm w-full">
              <option>合格</option>
              <option>普通</option>
              <option>不合格</option>
            </select>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">自己解決レベル</div>
            <input
              type="number"
              defaultValue={4}
              className="mt-1 border rounded px-2 py-1 text-sm w-full tabular"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 pt-3 border-t">
          <div className="flex-1" />
          <button className="border rounded-lg px-4 py-2 text-sm">クリア</button>
          <button className="bg-emerald-600 text-white rounded-lg px-4 py-2 text-sm font-medium">
            保存して確定
          </button>
        </div>
      </div>
    </>
  );
}
